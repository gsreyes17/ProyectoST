import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon, Button, Loading } from "./ui";

export default function Demo({
  config,
  session,
  menus,
  onLogout,
  refreshSession,
  renderPage,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [path, setPath] = useState(location.pathname);
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sidebar = useRef(null);
  const menuToggle = useRef(null);
  const compact = collapsed && !isMobile;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const resize = () => {
      setIsMobile(media.matches);
      setMobileOpen(false);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  // El vencimiento sigue aplicándose aunque no se muestre un contador.
  useEffect(() => {
    const checkExpiration = () => {
      if (Date.now() >= new Date(session.expires_at).getTime()) {
        window.dispatchEvent(new Event("session-expired"));
      }
    };
    const clock = setInterval(checkExpiration, 1000);
    document.addEventListener("visibilitychange", checkExpiration);
    return () => {
      clearInterval(clock);
      document.removeEventListener("visibilitychange", checkExpiration);
    };
  }, [session.expires_at]);

  useEffect(() => {
    const back = () => {
      setPath(location.pathname);
      setMobileOpen(false);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  // Al volver desde el panel administrativo se actualizan los menús autorizados.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void refreshSession();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refreshSession]);

  useEffect(() => {
    const activeGroup = menus.find((menu) =>
      menu.children?.some((child) => child.route === path),
    );
    setExpandedGroup(
      activeGroup?.id ?? menus.find((menu) => !menu.route)?.id ?? null,
    );
  }, [menus, path]);

  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector("a, button")?.focus();
    const keyboard = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuToggle.current?.focus();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...sidebar.current.querySelectorAll("a[href], button"),
      ].filter((element) => element.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyboard);
    };
  }, [mobileOpen, isMobile]);

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
    setMobileOpen(false);
    if (isMobile) menuToggle.current?.focus();
    void refreshSession();
  }
  function toggleGroup(id) {
    if (compact) {
      setCollapsed(false);
      setExpandedGroup(id);
    } else setExpandedGroup((current) => (current === id ? null : id));
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
  const appIcon =
    config.slug === "almacen"
      ? "package"
      : config.slug === "crm"
        ? "users"
        : "file";

  function menuLink(option, nested = false) {
    return (
      <a
        key={option.id}
        href={option.route}
        className={`demo-nav-link ${nested ? "nested" : ""} ${path === option.route ? "selected" : ""}`}
        aria-current={path === option.route ? "page" : undefined}
        aria-label={option.name}
        title={compact ? option.name : undefined}
        onClick={(event) => navigate(event, option.route)}
      >
        <Icon name={option.icon} size={19} />
        <span className="demo-nav-label">{option.name}</span>
      </a>
    );
  }

  return (
    <div
      className={`demo-shell ${compact ? "demo-sidebar-collapsed" : ""}`}
      style={{ "--accent": config.color }}
    >
      <a className="demo-skip-link" href="#demo-content">
        Saltar al contenido
      </a>
      {mobileOpen && isMobile && (
        <div
          className="demo-scrim"
          onClick={() => {
            setMobileOpen(false);
            menuToggle.current?.focus();
          }}
        />
      )}
      <aside
        ref={sidebar}
        id="demo-sidebar"
        className={`demo-sidebar ${mobileOpen ? "open" : ""}`}
        aria-label="Barra lateral"
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
        inert={isMobile && !mobileOpen}
      >
        <div className="demo-brand-row">
          <a
            className="demo-brand"
            href="/"
            aria-label={`${config.appName}, ir al inicio`}
            title={compact ? config.appName : undefined}
            onClick={(event) => navigate(event, "/")}
          >
            <span className="demo-brand-icon">
              <Icon name={appIcon} size={23} />
            </span>
            <span className="demo-brand-name">{config.appName}</span>
          </a>
          <button
            className="demo-mobile-close"
            aria-label="Cerrar menú"
            onClick={() => {
              setMobileOpen(false);
              menuToggle.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav
          id="demo-navigation"
          className="demo-navigation"
          aria-label="Menú principal"
        >
          <a
            href="/"
            className={`demo-nav-link demo-nav-home ${path === "/" ? "selected" : ""}`}
            aria-label="Inicio"
            aria-current={path === "/" ? "page" : undefined}
            title={compact ? "Inicio" : undefined}
            onClick={(event) => navigate(event, "/")}
          >
            <Icon name="overview" size={19} />
            <span className="demo-nav-label">Inicio</span>
          </a>
          {menus.map((menu) =>
            menu.route ? (
              menuLink(menu)
            ) : (
              <section className="demo-nav-group" key={menu.id}>
                <button
                  className={`demo-nav-heading ${menu.children?.some((child) => child.route === path) ? "current-group" : ""}`}
                  type="button"
                  aria-label={menu.name}
                  aria-expanded={!compact && expandedGroup === menu.id}
                  aria-controls={`demo-group-${menu.id}`}
                  title={compact ? menu.name : undefined}
                  onClick={() => toggleGroup(menu.id)}
                >
                  <Icon name={menu.icon} size={19} />
                  <span className="demo-nav-label">{menu.name}</span>
                  <Icon className="demo-nav-chevron" name="chevron" size={15} />
                </button>
                <div
                  id={`demo-group-${menu.id}`}
                  className="demo-nav-children"
                  hidden={compact || expandedGroup !== menu.id}
                >
                  {menu.children?.map((option) => menuLink(option, true))}
                </div>
              </section>
            ),
          )}
        </nav>
        <div className="demo-sidebar-footer">
          <button
            className="demo-logout"
            aria-label="Cerrar sesión"
            title={compact ? "Cerrar sesión" : undefined}
            onClick={onLogout}
          >
            <Icon name="logout" size={19} />
            <span className="demo-nav-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <div className="demo-body">
        <header className="demo-topbar">
          <button
            ref={menuToggle}
            className="demo-sidebar-toggle"
            aria-label={
              isMobile
                ? "Abrir menú"
                : compact
                  ? "Expandir barra lateral"
                  : "Contraer barra lateral"
            }
            title={
              isMobile
                ? "Abrir menú"
                : compact
                  ? "Expandir barra lateral"
                  : "Contraer barra lateral"
            }
            aria-expanded={isMobile ? mobileOpen : !compact}
            aria-controls="demo-sidebar"
            onClick={() =>
              isMobile
                ? setMobileOpen((current) => !current)
                : setCollapsed((current) => !current)
            }
          >
            <Icon name={isMobile || compact ? "menu" : "menus"} size={19} />
          </button>
          <h1>{title}</h1>
        </header>
        <main
          id="demo-content"
          className="demo-content"
          tabIndex={-1}
          aria-label={title}
        >
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
    </div>
  );
}
