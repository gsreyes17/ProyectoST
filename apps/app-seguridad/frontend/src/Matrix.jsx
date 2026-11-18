import { useState } from "react";
import { Icon, Badge, Empty } from "./ui";
import { kindNames } from "./Editors";

// Matriz de permisos: roles en columnas; familias, pantallas y sus grillas,
// botones y columnas en filas. Es una vista de lectura de lo que IAM entrega
// a cada rol; se edita desde el propio rol.
export default function Matrix({
  apps,
  roles,
  menus,
  capabilities,
  onEditRole,
}) {
  const clients = apps.filter((app) => !app.is_internal);
  const [selected, setSelected] = useState(null);
  const appId = clients.some((app) => app.id === selected)
    ? selected
    : clients[0]?.id;
  const appRoles = roles.filter((role) => role.app_id === appId);
  const appMenus = menus.filter((menu) => menu.app_id === appId);
  const pages = appMenus.filter((menu) => menu.route);
  const families = [
    ...appMenus
      .filter((menu) => !menu.route && !menu.parent_id)
      .map((group) => ({
        ...group,
        pages: pages.filter((page) => page.parent_id === group.id),
      })),
    {
      id: 0,
      name: "Sin familia",
      active: true,
      pages: pages.filter((page) => !page.parent_id),
    },
  ].filter((family) => family.pages.length);

  function cell(role, allowed, label) {
    return (
      <td key={role.id} className={`matrix-cell ${allowed ? "granted" : ""}`}>
        <span
          role="img"
          aria-label={`${role.name}: ${allowed ? "permitido" : "sin permiso"} — ${label}`}
          title={`${role.name} · ${label}`}
        >
          {allowed ? <Icon name="check" size={14} /> : "–"}
        </span>
      </td>
    );
  }

  return (
    <>
      <section className="panel">
        <div className="table-toolbar">
          <div className="matrix-legend">
            <span className="matrix-cell granted">
              <span>
                <Icon name="check" size={14} />
              </span>
            </span>
            Permitido
            <span className="matrix-cell">
              <span>–</span>
            </span>
            Sin permiso
          </div>
          <div className="table-filters">
            <select
              aria-label="Aplicación de la matriz"
              value={appId || ""}
              onChange={(event) => setSelected(Number(event.target.value))}
            >
              {clients.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!appRoles.length || !families.length ? (
          <Empty
            icon="roles"
            title="Todavía no hay nada que comparar"
            description="Esta aplicación necesita al menos un rol y una pantalla registrada."
          />
        ) : (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>Pantalla / elemento</th>
                  {appRoles.map((role) => (
                    <th key={role.id} className="matrix-role">
                      <button
                        type="button"
                        title="Editar permisos de este rol"
                        aria-label={`Editar permisos de ${role.name}`}
                        onClick={() => onEditRole(role)}
                      >
                        {role.name}
                        <Icon name="edit" size={12} />
                      </button>
                      <small>
                        {role.active
                          ? `${role.users_count} usuario${role.users_count === 1 ? "" : "s"}`
                          : "Desactivado"}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {families.map((family) => [
                  <tr key={`family-${family.id}`} className="matrix-family">
                    <th colSpan={appRoles.length + 1} scope="colgroup">
                      {family.name}
                      {!family.active && (
                        <Badge tone="gray">Familia desactivada</Badge>
                      )}
                    </th>
                  </tr>,
                  ...family.pages.flatMap((page) => [
                    <tr key={`page-${page.id}`} className="matrix-page">
                      <th scope="row">
                        <div className="matrix-page-name">
                          <Icon name={page.icon} size={16} />
                          <span>
                            {page.name}
                            <small>
                              Pantalla · {page.route}
                              {!page.active && " · desactivada"}
                            </small>
                          </span>
                        </div>
                      </th>
                      {appRoles.map((role) =>
                        cell(role, role.menu_ids.includes(page.id), page.name),
                      )}
                    </tr>,
                    ...capabilities
                      .filter((capability) => capability.menu_id === page.id)
                      .map((capability) => (
                        <tr
                          key={`capability-${capability.id}`}
                          className="matrix-element"
                        >
                          <th scope="row" title={capability.code}>
                            <span>
                              {capability.name}
                              <small>
                                {kindNames[capability.kind]}
                                {!capability.active && " · desactivado"}
                              </small>
                            </span>
                          </th>
                          {appRoles.map((role) =>
                            cell(
                              role,
                              // Un elemento solo es efectivo con su pantalla.
                              role.menu_ids.includes(page.id) &&
                                role.capability_ids.includes(capability.id),
                              `${page.name}: ${capability.name}`,
                            ),
                          )}
                        </tr>
                      )),
                  ]),
                ])}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {appRoles.length} roles · {pages.length} pantallas ·{" "}
            {
              capabilities.filter((capability) => capability.app_id === appId)
                .length
            }{" "}
            elementos
          </span>
          <span>Configuración centralizada</span>
        </div>
      </section>
      <div className="help-note">
        <Icon name="alert" size={18} />
        <span>
          La matriz muestra lo asignado a cada rol. Un rol, una pantalla o un
          elemento desactivado no concede acceso aunque aparezca marcado. Pulsa
          el nombre de un rol para cambiar sus permisos.
        </span>
      </div>
    </>
  );
}
