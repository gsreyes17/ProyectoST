import { useEffect, useState } from "react";
import { api } from "./api";
import {
  Icon,
  Button,
  Badge,
  Avatar,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Pagination,
  dateTime,
  duration,
} from "./ui";
import Editor from "./Editors";

const sections = [
  ["overview", "Resumen", "Tu seguridad, de un vistazo"],
  ["users", "Usuarios", "Las personas detrás de cada acceso"],
  [
    "applications",
    "Aplicaciones",
    "Un punto de acceso para todo tu ecosistema",
  ],
  ["roles", "Roles y permisos", "El acceso correcto para cada persona"],
  ["menus", "Menús", "La navegación que cada rol necesita"],
  ["sessions", "Sesiones", "Control sobre los accesos vigentes"],
  ["audit", "Auditoría", "Cada acceso deja una historia"],
];
const sectionIcon = {
  overview: "overview",
  users: "users",
  applications: "apps",
  roles: "roles",
  menus: "menus",
  sessions: "sessions",
  audit: "audit",
};
const editorTitles = {
  user: "usuario",
  role: "rol",
  menu: "menú",
  application: "aplicación",
};
const eventNames = {
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  MFA: "Verificación MFA",
  MFA_ENROLADO: "Autenticador configurado",
  ACCESO: "Acceso a pantalla",
  USUARIO_CREADO: "Usuario creado",
  USUARIO_EDITADO: "Usuario actualizado",
  ROL_CREADO: "Rol creado",
  ROL_EDITADO: "Rol actualizado",
  MENUS_ASIGNADOS: "Menús asignados",
  MENU_CREADO: "Menú creado",
  MENU_EDITADO: "Menú actualizado",
  ROLES_ASIGNADOS: "Roles asignados",
  APLICACIONES_ASIGNADAS: "Aplicaciones asignadas",
  SESION_REVOCADA: "Sesión revocada",
  CREDENCIAL_ROTADA: "Credencial rotada",
  MFA_RESTABLECIDO: "MFA restablecido",
  MFA_POLITICA_EDITADA: "Política de doble factor actualizada",
  CLAVE_RESTABLECIDA: "Contraseña restablecida",
};

export default function Admin({ session, config, onLogout }) {
  const [section, setSection] = useState(() =>
    sections.some(([key]) => key === location.hash.slice(1))
      ? location.hash.slice(1)
      : "overview",
  );
  const [reference, setReference] = useState({
    apps: [],
    roles: [],
    menus: [],
  });
  const [payload, setPayload] = useState(null);
  const data = payload?.section === section ? payload.value : null;
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [appFilter, setAppFilter] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [editor, setEditor] = useState(null);
  const [secret, setSecret] = useState("");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (now >= new Date(session.expires_at).getTime())
      window.dispatchEvent(new Event("session-expired"));
  }, [now, session.expires_at]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      api("/admin/applications"),
      api("/admin/roles"),
      api("/admin/menus"),
      api("/admin/overview"),
    ])
      .then(([apps, roles, menus, summary]) => {
        if (alive) {
          setReference({ apps, roles, menus });
          setOverview(summary);
        }
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [version]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const timeout = setTimeout(
      async () => {
        try {
          const query = new URLSearchParams({
            search,
            page,
            result: resultFilter,
            from,
            until,
          });
          const next = await api(
            `/admin/${section}${["users", "audit"].includes(section) ? `?${query}` : ""}`,
          );
          if (alive) setPayload({ section, value: next });
        } catch (error) {
          if (alive) setError(error.message);
        } finally {
          if (alive) setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [section, version, search, page, resultFilter, from, until]);
  useEffect(() => {
    function changed() {
      const key = location.hash.slice(1);
      if (sections.some(([id]) => id === key)) setSection(key);
    }
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  function navigate(next) {
    setSection(next);
    location.hash = next;
    setSearch("");
    setPage(1);
    setAppFilter("");
    setError("");
    setMobileOpen(false);
  }
  function refresh(message) {
    setVersion((value) => value + 1);
    if (message) setToast(message);
  }
  async function confirmAction() {
    setActionBusy(true);
    try {
      const result = await api(confirm.path, { method: "POST", body: {} });
      if (result.key) setSecret(result.key);
      setConfirm(null);
      refresh("Cambios aplicados correctamente.");
    } catch (error) {
      setError(error.message);
      setConfirm(null);
    } finally {
      setActionBusy(false);
    }
  }
  const current = sections.find(([key]) => key === section);
  const items = Array.isArray(data)
    ? data.filter(
        (item) =>
          (!appFilter || item.app_id === Number(appFilter)) &&
          (!search ||
            JSON.stringify([
              item.name,
              item.description,
              item.email,
              item.full_name,
              item.app_name,
            ])
              .toLowerCase()
              .includes(search.toLowerCase())),
      )
    : data?.items || [];
  const remaining = Math.max(
    0,
    Math.ceil((new Date(session.expires_at).getTime() - now) / 60000),
  );
  const newType = {
    users: "user",
    applications: "application",
    roles: "role",
    menus: "menu",
  }[section];
  const applicationName = (id) =>
    reference.apps.find((app) => app.id === id)?.name || "—";
  const editButton = (type, item) => (
    <button
      className="icon-button"
      title="Editar"
      aria-label={`Editar ${item.full_name || item.name}`}
      onClick={() => setEditor({ type, item })}
    >
      <Icon name="edit" size={17} />
    </button>
  );
  const activeBadge = (active) => (
    <Badge tone={active ? "green" : "gray"}>
      {active ? "Habilitado" : "Desactivado"}
    </Badge>
  );
  function eventTable(events, compact = false) {
    return events.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Actividad</th>
              <th>Usuario</th>
              {!compact && <th>Aplicación</th>}
              <th>Resultado</th>
              <th>Fecha y hora</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <span className="activity-cell">
                    <span
                      className={`event-icon ${event.result === "DENEGADO" ? "red" : ""}`}
                    >
                      <Icon
                        name={event.result === "DENEGADO" ? "alert" : "shield"}
                        size={16}
                      />
                    </span>
                    <span>
                      <strong>
                        {eventNames[event.event] ||
                          event.event.replaceAll("_", " ")}
                      </strong>
                      {!compact && (
                        <small>{event.detail || event.ip_address || "—"}</small>
                      )}
                    </span>
                  </span>
                </td>
                <td>{event.full_name || "Sin identificar"}</td>
                {!compact && <td>{event.app_name || "—"}</td>}
                <td>
                  <Badge tone={event.result === "OK" ? "green" : "red"}>
                    {event.result === "OK" ? "Correcto" : "Denegado"}
                  </Badge>
                </td>
                <td className="nowrap muted">
                  {dateTime(event.created_at, config.timeZone)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title="La actividad aparecerá aquí"
        description="Los accesos y cambios de configuración se registran automáticamente."
        icon="audit"
      />
    );
  }
  return (
    <div className="app-shell">
      <div
        className={`sidebar-scrim ${mobileOpen ? "visible" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <a
          href="#overview"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-symbol">
            <Icon name="shield" size={25} />
          </span>
          <span>
            Seguridad<small>TRANSVERSAL</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-monogram">
            {config.companyName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{config.companyName}</strong>
            <small>Espacio de administración</small>
          </span>
          <Icon name="down" size={14} />
        </div>
        <span className="nav-caption">PRINCIPAL</span>
        <nav className="main-nav">
          {sections.map(([key, label]) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon name={sectionIcon[key]} size={19} />
              <span>{label}</span>
              {key === "applications" && (
                <small>
                  {reference.apps.filter((app) => !app.is_internal).length}
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-status">
            <span className="live-dot" />
            <span>
              Sesión activa
              <small>
                {session.mfa_verified
                  ? "MFA verificado"
                  : "Acceso con contraseña"}
              </small>
            </span>
            <Icon name="shield" size={20} />
          </div>
          <div className="sidebar-profile">
            <Avatar name={session.full_name} small />
            <span>
              <strong>{session.full_name}</strong>
              <small>Administrador</small>
            </span>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              onClick={onLogout}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <Icon name="layout" size={17} />
            <span>Administración</span>
            <Icon name="chevron" size={13} />
            <strong>{current[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="session-chip">
              <Icon name="sessions" size={15} />
              {remaining >= 60
                ? `${Math.floor(remaining / 60)} h ${remaining % 60} min`
                : `${remaining} min`}{" "}
              de sesión
            </span>
            <span className="topbar-divider" />
            <Avatar name={session.full_name} small />
          </div>
        </header>
        <main className="main-content">
          <div className="page-title">
            <div>
              <span className="eyebrow">CENTRO DE SEGURIDAD</span>
              <h1>
                {current[1]}
                {section === "overview" && <span className="title-dot">.</span>}
              </h1>
              <p>{current[2]}</p>
            </div>
            <div className="page-actions">
              <Button
                variant="secondary"
                icon="refresh"
                onClick={() => refresh()}
                aria-label="Actualizar información"
              >
                Actualizar
              </Button>
              {newType && (
                <Button
                  icon="plus"
                  onClick={() => setEditor({ type: newType, item: null })}
                >
                  {section === "applications"
                    ? "Nueva aplicación"
                    : section === "menus"
                      ? "Nuevo menú"
                      : section === "roles"
                        ? "Nuevo rol"
                        : "Nuevo usuario"}
                </Button>
              )}
            </div>
          </div>
          <ErrorBox error={error} />
          {loading || (data === null && !error) ? (
            <Loading />
          ) : data === null ? (
            <Empty
              title="Información no disponible"
              description="Comprueba la conexión y pulsa Actualizar para volver a intentar."
            />
          ) : section === "overview" ? (
            <>
              <div className="welcome-banner">
                <div>
                  <span className="banner-tag">
                    <Icon name="shield" size={14} />
                    TU ECOSISTEMA, PROTEGIDO
                  </span>
                  <h2>Todo empieza con un acceso seguro.</h2>
                  <p>
                    Gestiona quién entra, qué puede ver y cuánto tiempo
                    permanece conectado.
                  </p>
                  <button onClick={() => navigate("users")}>
                    Administrar accesos <Icon name="next" size={16} />
                  </button>
                </div>
                <div className="banner-shield" aria-hidden="true">
                  <div />
                  <Icon name="shield" size={80} />
                </div>
              </div>
              <div className="stats-grid">
                {[
                  [
                    "Usuarios activos",
                    data.users,
                    "users",
                    "Personas con acceso habilitado",
                    "indigo",
                  ],
                  [
                    "Aplicaciones",
                    data.applications,
                    "apps",
                    "Integradas al centro de seguridad",
                    "blue",
                  ],
                  [
                    "Roles activos",
                    data.roles,
                    "roles",
                    "Permisos definidos por aplicación",
                    "purple",
                  ],
                  [
                    "Sesiones abiertas",
                    data.sessions,
                    "sessions",
                    "Accesos vigentes en este momento",
                    "green",
                  ],
                ].map(([label, value, icon, caption, tone]) => (
                  <div className="stat-card" key={label}>
                    <div className="stat-card-top">
                      <span>{label}</span>
                      <span className={`stat-icon ${tone}`}>
                        <Icon name={icon} size={19} />
                      </span>
                    </div>
                    <strong>
                      {value}
                      <span>↗</span>
                    </strong>
                    <small>{caption}</small>
                  </div>
                ))}
              </div>
              <div className="overview-columns">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Aplicaciones conectadas</h2>
                      <p>Seguridad compartida. Operación independiente.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("applications")}
                    >
                      Ver todas <Icon name="arrow" size={15} />
                    </button>
                  </div>
                  <div className="app-tiles">
                    {config.demos.map((demo, index) => (
                      <a
                        key={demo.slug}
                        href={`http://localhost:${demo.port}`}
                        target="_blank"
                        rel="noreferrer"
                        className="app-tile"
                      >
                        <span
                          className="application-symbol"
                          style={{ "--app-color": demo.color }}
                        >
                          <Icon
                            name={["users", "package", "file"][index]}
                            size={25}
                          />
                        </span>
                        <div>
                          <strong>{demo.name}</strong>
                          <small>Cliente de demostración</small>
                        </div>
                        <Icon name="arrow" size={18} />
                      </a>
                    ))}
                  </div>
                </section>
                <section className="panel protection-panel">
                  <span className="protection-icon">
                    <Icon name="fingerprint" size={25} />
                  </span>
                  <h2>Una capa extra de confianza</h2>
                  <p>
                    Configura qué usuarios deben utilizar doble factor al
                    ingresar.
                  </p>
                  <div>
                    <strong>
                      {data.mfa_users}
                      <small> / {data.users}</small>
                    </strong>
                    <span>usuarios con MFA configurado</span>
                  </div>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${data.users ? (data.mfa_users / data.users) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small>
                    {data.denied} accesos denegados en las últimas 24 horas
                  </small>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Actividad reciente</h2>
                    <p>Trazabilidad de los últimos accesos y cambios.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("audit")}
                  >
                    Ver auditoría <Icon name="arrow" size={15} />
                  </button>
                </div>
                {eventTable(data.recent, true)}
              </section>
            </>
          ) : (
            <>
              {section === "applications" ? (
                <div className="application-grid">
                  {items.map((app) => (
                    <section className="panel application-card" key={app.id}>
                      <div className="application-card-top">
                        <span
                          className="application-symbol"
                          style={{
                            "--app-color":
                              config.demos.find(
                                (demo) => demo.slug === app.slug,
                              )?.color || "#4f46e5",
                          }}
                        >
                          <Icon
                            name={
                              app.is_internal
                                ? "shield"
                                : app.slug === "almacen"
                                  ? "package"
                                  : app.slug === "facturacion"
                                    ? "file"
                                    : "apps"
                            }
                            size={27}
                          />
                        </span>
                        {activeBadge(app.active)}
                      </div>
                      <h2>{app.name}</h2>
                      <p>
                        {app.description ||
                          "Administración central de identidades y acceso."}
                      </p>
                      <div className="application-meta">
                        <span>
                          <Icon name="layers" size={15} />
                          {app.platform}
                        </span>
                        <code>{app.slug}</code>
                      </div>
                      <div className="application-card-actions">
                        <Button
                          variant="secondary"
                          icon="edit"
                          onClick={() =>
                            setEditor({ type: "application", item: app })
                          }
                        >
                          Editar
                        </Button>
                        {!app.is_internal && (
                          <button
                            className="icon-button"
                            aria-label={`Rotar credencial de ${app.name}`}
                            title="Rotar credencial"
                            onClick={() =>
                              setConfirm({
                                title: "Rotar credencial de integración",
                                text: "La clave anterior dejará de funcionar. Actualiza el backend cliente y reinícialo con la nueva credencial.",
                                path: `/admin/applications/${app.id}/rotate-key`,
                              })
                            }
                          >
                            <Icon name="key" size={18} />
                          </button>
                        )}
                        {config.demos.some(
                          (demo) => demo.slug === app.slug,
                        ) && (
                          <a
                            className="text-button"
                            href={`http://localhost:${config.demos.find((demo) => demo.slug === app.slug).port}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir <Icon name="arrow" size={16} />
                          </a>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <div className="table-toolbar">
                    <div className="search-field">
                      <Icon name="search" size={17} />
                      <input
                        aria-label="Buscar registros"
                        placeholder={
                          section === "users"
                            ? "Buscar por nombre o correo…"
                            : "Buscar registros…"
                        }
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className="table-filters">
                      {["roles", "menus"].includes(section) && (
                        <select
                          aria-label="Filtrar por aplicación"
                          value={appFilter}
                          onChange={(event) => setAppFilter(event.target.value)}
                        >
                          <option value="">Todas las aplicaciones</option>
                          {reference.apps.map((app) => (
                            <option key={app.id} value={app.id}>
                              {app.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {section === "audit" && (
                        <>
                          <input
                            aria-label="Desde fecha"
                            type="date"
                            value={from}
                            onChange={(event) => {
                              setFrom(event.target.value);
                              setPage(1);
                            }}
                          />
                          <input
                            aria-label="Hasta fecha"
                            type="date"
                            value={until}
                            onChange={(event) => {
                              setUntil(event.target.value);
                              setPage(1);
                            }}
                          />
                          <select
                            aria-label="Filtrar por resultado"
                            value={resultFilter}
                            onChange={(event) => {
                              setResultFilter(event.target.value);
                              setPage(1);
                            }}
                          >
                            <option value="">Todos los resultados</option>
                            <option value="OK">Correctos</option>
                            <option value="DENEGADO">Denegados</option>
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                  {section === "audit" ? (
                    eventTable(items)
                  ) : !items.length ? (
                    <Empty
                      icon={sectionIcon[section]}
                      title="No encontramos registros"
                      description="Crea un registro o ajusta los filtros para continuar."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {(
                              {
                                users: [
                                  "Usuario",
                                  "Aplicaciones",
                                  "Roles",
                                  "Doble factor",
                                  "Estado",
                                  "",
                                ],
                                roles: [
                                  "Rol",
                                  "Aplicación",
                                  "Sesión máxima",
                                  "Opciones",
                                  "Usuarios",
                                  "Estado",
                                  "",
                                ],
                                menus: [
                                  "Menú",
                                  "Aplicación",
                                  "Código / Ruta",
                                  "Orden",
                                  "Estado",
                                  "",
                                ],
                                sessions: [
                                  "Usuario",
                                  "Aplicación / Rol",
                                  "Inicio",
                                  "Vencimiento",
                                  "",
                                ],
                              }[section] || []
                            ).map((column, index) => (
                              <th key={index}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section === "users" &&
                            items.map((user) => (
                              <tr key={user.id}>
                                <td>
                                  <div className="person-cell">
                                    <Avatar name={user.full_name} />
                                    <span>
                                      <strong>{user.full_name}</strong>
                                      <small>{user.email}</small>
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="tag-list">
                                    {user.app_ids.length ? (
                                      user.app_ids.map((id) => (
                                        <span key={id} className="tag">
                                          {applicationName(id)}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="muted">Sin asignar</span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="muted">
                                    {user.role_ids.length} asignado
                                    {user.role_ids.length !== 1 ? "s" : ""}
                                  </span>
                                </td>
                                <td>
                                  <Badge
                                    tone={
                                      !user.mfa_required
                                        ? "gray"
                                        : user.mfa_enabled
                                          ? "indigo"
                                          : "amber"
                                    }
                                  >
                                    {!user.mfa_required
                                      ? "No exigido"
                                      : user.mfa_enabled
                                        ? "Exigido"
                                        : "Por configurar"}
                                  </Badge>
                                </td>
                                <td>{activeBadge(user.active)}</td>
                                <td>
                                  <div className="row-actions">
                                    {editButton("user", user)}
                                    <button
                                      className="icon-button"
                                      aria-label={`Restablecer contraseña de ${user.full_name}`}
                                      title="Restablecer contraseña"
                                      onClick={() =>
                                        setEditor({
                                          type: "resetPassword",
                                          item: user,
                                        })
                                      }
                                    >
                                      <Icon name="key" size={17} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label={`Restablecer MFA de ${user.full_name}`}
                                      title="Restablecer MFA"
                                      onClick={() =>
                                        setEditor({
                                          type: "resetMfa",
                                          item: user,
                                        })
                                      }
                                    >
                                      <Icon name="fingerprint" size={17} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          {section === "roles" &&
                            items.map((role) => (
                              <tr key={role.id}>
                                <td>
                                  <div className="name-cell">
                                    <span className="small-symbol">
                                      <Icon
                                        name={
                                          role.is_system_admin
                                            ? "shield"
                                            : "roles"
                                        }
                                        size={18}
                                      />
                                    </span>
                                    <span>
                                      <strong>{role.name}</strong>
                                      <small>
                                        {role.description || "Sin descripción"}
                                      </small>
                                    </span>
                                  </div>
                                </td>
                                <td>{role.app_name}</td>
                                <td>
                                  <span className="duration-tag">
                                    <Icon name="sessions" size={15} />
                                    {duration(role.duration_minutes)}
                                  </span>
                                </td>
                                <td>
                                  {role.is_system_admin
                                    ? "Administración interna"
                                    : `${role.menu_ids.length} opciones`}
                                </td>
                                <td>{role.users_count}</td>
                                <td>{activeBadge(role.active)}</td>
                                <td>{editButton("role", role)}</td>
                              </tr>
                            ))}
                          {section === "menus" &&
                            items.map((menu) => (
                              <tr key={menu.id}>
                                <td>
                                  <div
                                    className={`name-cell ${menu.parent_id ? "child-menu" : ""}`}
                                  >
                                    <span className="small-symbol">
                                      <Icon name={menu.icon} size={18} />
                                    </span>
                                    <span>
                                      <strong>{menu.name}</strong>
                                      <small>
                                        {menu.route
                                          ? "Opción de navegación"
                                          : "Grupo de opciones"}
                                      </small>
                                    </span>
                                  </div>
                                </td>
                                <td>{menu.app_name}</td>
                                <td>
                                  <div className="code-cell">
                                    <code>{menu.code}</code>
                                    <small>
                                      {menu.route || "Contenedor sin ruta"}
                                    </small>
                                  </div>
                                </td>
                                <td>{menu.position}</td>
                                <td>{activeBadge(menu.active)}</td>
                                <td>{editButton("menu", menu)}</td>
                              </tr>
                            ))}
                          {section === "sessions" &&
                            items.map((active) => (
                              <tr key={active.id}>
                                <td>
                                  <div className="person-cell">
                                    <Avatar name={active.full_name} />
                                    <span>
                                      <strong>
                                        {active.full_name}
                                        {active.id === session.id && (
                                          <span className="inline-label">
                                            Tú
                                          </span>
                                        )}
                                      </strong>
                                      <small>{active.email}</small>
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="stack-cell">
                                    <strong>{active.app_name}</strong>
                                    <small>{active.role_name}</small>
                                  </div>
                                </td>
                                <td className="nowrap muted">
                                  {dateTime(active.created_at, config.timeZone)}
                                </td>
                                <td className="nowrap">
                                  {dateTime(active.expires_at, config.timeZone)}
                                </td>
                                <td>
                                  <Button
                                    variant="danger-quiet"
                                    icon="logout"
                                    onClick={() =>
                                      setConfirm({
                                        title: "Revocar sesión",
                                        text: "El usuario deberá ingresar nuevamente según su configuración de doble factor.",
                                        path: `/admin/sessions/${active.id}/revoke`,
                                      })
                                    }
                                  >
                                    Revocar
                                  </Button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {["users", "audit"].includes(section) ? (
                    <Pagination
                      total={data?.total || 0}
                      page={page}
                      onChange={setPage}
                    />
                  ) : (
                    <div className="table-footer">
                      <span>{items.length} registros</span>
                      <span>Configuración centralizada</span>
                    </div>
                  )}
                </section>
              )}
              {section === "menus" && (
                <div className="help-note">
                  <Icon name="alert" size={18} />
                  <span>
                    Los menús administran el acceso a páginas existentes. Crear
                    una opción no genera una pantalla nueva en el cliente.
                  </span>
                </div>
              )}
              {section === "roles" && (
                <div className="help-note">
                  <Icon name="sessions" size={18} />
                  <span>
                    La duración de sesión es configurable por rol. Para exponer
                    el vencimiento puedes usar un rol de 1 minuto.
                  </span>
                </div>
              )}
            </>
          )}
          <footer className="main-footer">
            <span>
              {config.companyName} · {config.appName}
            </span>
            <span>
              <Icon name="shield" size={13} />
              Identidad y acceso, en un solo lugar
            </span>
          </footer>
        </main>
      </div>
      {editor && (
        <Modal
          title={
            editor.type.startsWith("reset")
              ? editor.type === "resetMfa"
                ? "Restablecer doble factor"
                : "Restablecer contraseña"
              : `${editor.item ? "Editar" : editor.type === "application" ? "Nueva" : "Nuevo"} ${editorTitles[editor.type]}`
          }
          description={
            editor.type === "role"
              ? "Define los accesos y el tiempo de sesión de este rol."
              : undefined
          }
          onClose={() => setEditor(null)}
          wide={editor.type === "user"}
        >
          <Editor
            key={`${editor.type}-${editor.item?.id || "new"}`}
            {...editor}
            {...reference}
            adminMfaRequired={session.mfa_required}
            onClose={() => setEditor(null)}
            onSaved={(result) => {
              setEditor(null);
              refresh("Cambios guardados correctamente.");
              if (result?.key) setSecret(result.key);
            }}
          />
        </Modal>
      )}
      {secret && (
        <Modal
          title="Guarda la credencial de integración"
          description="Solo se muestra una vez. Guárdala en la configuración privada del backend cliente."
          onClose={() => setSecret("")}
        >
          <div className="editor-body">
            <code className="secret-value">{secret}</code>
            <Button
              variant="secondary"
              icon="copy"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                setToast("Credencial copiada.");
              }}
            >
              Copiar credencial
            </Button>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setSecret("")}>Ya la guardé</Button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          description={confirm.text}
          onClose={() => setConfirm(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button busy={actionBusy} onClick={confirmAction}>
              Confirmar
            </Button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="success" size={19} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Cerrar notificación">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
