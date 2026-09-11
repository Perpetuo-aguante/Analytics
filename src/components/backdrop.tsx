// El fondo de la app: manchas de marca a la deriva, granuladas, detrás de
// todo el contenido. Sin estado y sin efectos — es CSS puro (ver la sección
// "Fondo granulado" en globals.css), así que se queda como server component
// y no agrega nada al bundle del cliente.
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop__blobs" />
      <div className="backdrop__veil" />
      <div className="backdrop__grain" />
    </div>
  );
}
