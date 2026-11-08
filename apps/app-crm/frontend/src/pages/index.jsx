// Agrega las pantallas de esta app en esta carpeta. El backend autoriza antes de mostrarlas.
export default function AppPages({ page, path }) {
  return (
    <section
      className="demo-empty-page"
      aria-label={`Contenido de ${page?.name || "Inicio"}`}
      data-route={path}
    />
  );
}
