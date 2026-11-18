import { useEffect, useState } from "react";
import { api } from "./api";
import { Icon, Button, Loading } from "./ui";

// Facturación usa navegación superior y un estilo sobrio de documento.
// La seguridad es la misma que en las otras apps: IAM entrega los menús del rol
// y el backend autoriza cada pantalla antes de mostrarla.
export default function Demo({
  config,
  session,
  menus,
  onLogout,
  refreshSession,
  renderPage,
}) {
  const [path, setPath] = useState(location.pathname);
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // El vencimiento sigue aplicándose aunque no se muestre un contador.
  useEffect(() => {
    const checkExpiration = () => {
      if (Date.now() >= new Date(session.expires_at).getTime())
        window.dispatchEvent(new Event("session-expired"));
    };
    const clock = setInterval(checkExpiration, 1000);
    document.addEventListener("visibilitychange", checkExpiration);
    return () => {
      clearInterval(clock);
      document.removeEventListener("visibilitychange", checkExpiration);
    };
  }, [session.expires_at]);

  useEffect(() => {
    const back = () => setPath(location.pathname);
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  // Al volver desde el panel administrativo se actualizan menús y capacidades.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void refreshSession();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refreshSession]);

  useEffect(() => {
    let alive = true;
    setPage(null);
    setError("");
    setLoading(path !== "/");
    if (path === "/") return;
    api(`/demo/page?path=${encodeURIComponent(path)}`)
      .then((result) => {
        if (alive) setPage(result);
      })
      .catch((error) => {
        if (alive) setError(error.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  function navigate(event, route) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    history.pushState({}, "", route);
    setPath(route);
    void refreshSession();
  }
  const activeOption = menus
    .flatMap((menu) => (menu.route ? [menu] : menu.children || []))
    .find((menu) => menu.route === path);
  const title =
    path === "/"
      ? "Inicio"
      : error
        ? "Acceso no disponible"
        : page?.route === path
          ? page.name
          : activeOption?.name || "Página";
  const link = (route, name) => (
    <a
      key={route}
      href={route}
      className={path === route ? "selected" : ""}
      aria-current={path === route ? "page" : undefined}
      onClick={(event) => navigate(event, route)}
    >
      {name}
    </a>
  );

  return (
    <div className="fx-shell" style={{ "--accent": config.color }}>
      <a className="fx-skip-link" href="#fx-content">
        Saltar al contenido
      </a>
      <header className="fx-header">
        <a
          className="fx-brand"
          href="/"
          aria-label={`${config.appName}, ir al inicio`}
          onClick={(event) => navigate(event, "/")}
        >
          <Icon name="file" size={22} />
          {config.appName}
        </a>
        <nav className="fx-nav" aria-label="Menú principal">
          {link("/", "Inicio")}
          {menus.map((menu) =>
            menu.route ? (
              link(menu.route, menu.name)
            ) : (
              // Familia de menú: su etiqueta precede a las pantallas autorizadas.
              <div
                className="fx-nav-group"
                key={menu.id}
                role="group"
                aria-label={menu.name}
              >
                <span aria-hidden="true">{menu.name}</span>
                {menu.children?.map((option) =>
                  link(option.route, option.name),
                )}
              </div>
            ),
          )}
        </nav>
        <div className="fx-user">
          <span className="fx-user-text">
            <strong>{session.full_name}</strong>
            <small>{session.role_name}</small>
          </span>
          <button
            className="fx-logout"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={onLogout}
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>
      <main
        id="fx-content"
        className="fx-main"
        tabIndex={-1}
        aria-label={title}
      >
        <div className="fx-title">
          <h1>{title}</h1>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <section className="demo-access-denied" role="alert">
            <Icon name="lock" size={30} />
            <h2>Acceso no disponible</h2>
            <p>{error}</p>
            <Button
              onClick={() => {
                history.pushState({}, "", "/");
                setPath("/");
              }}
            >
              Volver al inicio
            </Button>
          </section>
        ) : (
          renderPage({ page, path })
        )}
      </main>
    </div>
  );
}
