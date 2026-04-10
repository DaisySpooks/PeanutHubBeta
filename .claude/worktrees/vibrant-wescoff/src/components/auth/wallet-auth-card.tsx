"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { useRouter } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

function shortenWalletAddress(walletAddress: string) {
  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

type SessionUser = {
  walletAddress: string;
  nutshellBalance: number;
  hasRequiredCollectionAccess: boolean;
  requiredCollectionMint?: string | null;
};

export function WalletAuthCard() {
  const router = useRouter();
  const { connected, disconnect, publicKey, signMessage } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const lastWalletAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });

        const data = (await response.json()) as {
          user?: SessionUser;
        };

        if (!isActive) {
          return;
        }

        if (response.status === 403 && data.user) {
          setSessionUser(data.user);
          return;
        }

        if (!response.ok || !data.user) {
          setSessionUser(null);
          return;
        }

        setSessionUser(data.user);
      } catch {
        if (isActive) {
          setSessionUser(null);
        }
      } finally {
        if (isActive) {
          setIsCheckingSession(false);
        }
      }
    }

    void loadSession();

    return () => {
      isActive = false;
    };
  }, []);

  const authenticateWallet = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("This wallet does not support message signing.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const walletAddress = publicKey.toBase58();
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletAddress }),
      });

      const challengeData = (await challengeResponse.json()) as {
        error?: string;
        message?: string;
        nonce?: string;
        issuedAt?: string;
      };

      if (!challengeResponse.ok || !challengeData.message || !challengeData.nonce || !challengeData.issuedAt) {
        throw new Error(challengeData.error || "Unable to create wallet challenge.");
      }

      const signature = await signMessage(new TextEncoder().encode(challengeData.message));
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          signature: bs58.encode(signature),
          nonce: challengeData.nonce,
          issuedAt: challengeData.issuedAt,
        }),
      });

      const verifyData = (await verifyResponse.json()) as {
        error?: string;
        user?: SessionUser;
      };

      if (!verifyResponse.ok || !verifyData.user) {
        throw new Error(verifyData.error || "Unable to verify wallet signature.");
      }

      setSessionUser(verifyData.user);
      router.push(verifyData.user.hasRequiredCollectionAccess ? "/dashboard" : "/no-access");
      router.refresh();
    } catch (caughtError) {
      lastWalletAttemptRef.current = null;
      const message = caughtError instanceof Error ? caughtError.message : "Wallet authentication failed.";
      setError(message);
    } finally {
      setIsLoading(false);
      setIsCheckingSession(false);
    }
  }, [publicKey, router, signMessage]);

  useEffect(() => {
    if (!connected || !publicKey) {
      lastWalletAttemptRef.current = null;
      setError(null);
      return;
    }

    if (sessionUser?.walletAddress === publicKey.toBase58()) {
      return;
    }

    if (lastWalletAttemptRef.current === publicKey.toBase58()) {
      return;
    }

    lastWalletAttemptRef.current = publicKey.toBase58();
    void authenticateWallet();
  }, [authenticateWallet, connected, publicKey, sessionUser]);

  async function handleDisconnect() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    await disconnect();
    setSessionUser(null);
    lastWalletAttemptRef.current = null;
    router.refresh();
  }

  return (
    <section className="panel authCard">
      <div className="authCardHeader">
        <p className="heroKicker">Wallet access</p>
        <h2>Connect Phantom and sign in</h2>
      </div>

      <p className="authCardCopy">
        Nut Reserve uses your wallet address as your account identifier. On first sign-in we verify
        your signature, create the user record if needed, and store a secure session cookie.
      </p>

      <div className="authActions">
        <WalletMultiButton className="walletButton" />
        {connected ? (
          <button className="secondaryButton" onClick={handleDisconnect} type="button">
            Disconnect
          </button>
        ) : null}
      </div>

      <div className="authStatusBox">
        {isCheckingSession || isLoading ? <p>Authenticating wallet...</p> : null}
        {!connected && !isLoading ? <p>Connect your wallet to begin the sign-in flow.</p> : null}
        {connected && publicKey && !isLoading && !error ? (
          <p>Connected wallet: {shortenWalletAddress(publicKey.toBase58())}</p>
        ) : null}
        {sessionUser ? (
          <p>
            Session ready for {shortenWalletAddress(sessionUser.walletAddress)}.
            {sessionUser.hasRequiredCollectionAccess
              ? " Required collection ownership verified."
              : " Required collection NFT not found for this wallet."}
          </p>
        ) : null}
        {error ? <p className="authError">{error}</p> : null}
      </div>

      <div className="authFooter">
        <a
          className="primaryLinkButton"
          href={sessionUser?.hasRequiredCollectionAccess ? "/dashboard" : "/no-access"}
        >
          Continue
        </a>
        <p>
          New users start with a Nutshell balance of <strong>0</strong> until rewards are credited.
        </p>
      </div>
    </section>
  );
}
