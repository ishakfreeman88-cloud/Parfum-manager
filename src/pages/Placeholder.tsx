export default function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="card empty">
        <p>Ce module n'est pas encore développé.</p>
        <p className="muted">Prévu : {phase}</p>
      </div>
    </section>
  );
}
