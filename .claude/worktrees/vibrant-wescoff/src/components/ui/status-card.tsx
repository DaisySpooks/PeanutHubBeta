type StatusCardProps = {
  title: string;
  description: string;
  eyebrow: string;
};

export function StatusCard({ title, description, eyebrow }: StatusCardProps) {
  return (
    <article className="statusCard">
      <p className="statusEyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
