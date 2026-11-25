import { useEffect, useState } from "react";
import { api } from "./api";
import { Avatar, Badge, Empty, ErrorBox, Icon, Loading, dateTime } from "./ui";

export const entityNames = {
  user: "Usuario",
  role: "Rol",
  menu: "Menú",
  application: "Aplicación",
};
const actionNames = {
  USUARIO_CREADO: "Usuario creado",
  USUARIO_EDITADO: "Usuario actualizado",
  APLICACIONES_ASIGNADAS: "Aplicaciones asignadas",
  ROLES_ASIGNADOS: "Roles asignados",
  MFA_RESTABLECIDO: "Doble factor restablecido",
  CLAVE_RESTABLECIDA: "Contraseña restablecida",
  APLICACION_CREADA: "Aplicación creada",
  APLICACION_EDITADA: "Aplicación actualizada",
  CREDENCIAL_ROTADA: "Credencial rotada",
  ROL_CREADO: "Rol creado",
  ROL_EDITADO: "Rol actualizado",
  MENUS_ASIGNADOS: "Pantallas asignadas",
  MENU_CREADO: "Menú creado",
  MENU_EDITADO: "Menú actualizado",
};
// El orden de este objeto es el orden en que se muestran los campos.
const fieldNames = {
  full_name: "Nombre",
  name: "Nombre",
  email: "Correo",
  application: "Aplicación",
  code: "Código",
  slug: "Identificador",
  route: "Ruta",
  parent: "Grupo",
  description: "Descripción",
  platform: "Plataforma",
  duration_minutes: "Duración de sesión",
  screens: "Pantallas",
  applications: "Aplicaciones",
  roles: "Roles",
  mfa_required: "Doble factor",
  position: "Orden",
  icon: "Icono",
  active: "Estado",
};

function show(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "active") return value ? "Habilitado" : "Desactivado";
  if (field === "mfa_required") return value ? "Exigido" : "No exigido";
  if (field === "duration_minutes") return `${value} min`;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Ninguna";
  return String(value);
}

// Diferencias legibles entre el estado anterior y el nuevo de un registro.
function differences(before, after) {
  if (!after) return [];
  // Alta: los campos con valor, en un orden fijo y legible.
  if (!before)
    return Object.keys(fieldNames)
      .filter(
        (field) =>
          field in after && after[field] !== null && after[field] !== "",
      )
      .map((field) => ({ field, text: show(field, after[field]) }));
  return Object.keys(fieldNames)
    .filter(
      (field) =>
        field in after &&
        JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    )
    .map((field) => {
      if (Array.isArray(after[field])) {
        const added = after[field].filter(
          (value) => !(before[field] || []).includes(value),
        );
        const removed = (before[field] || []).filter(
          (value) => !after[field].includes(value),
        );
        return { field, added, removed };
      }
      return {
        field,
        from: show(field, before[field]),
        to: show(field, after[field]),
      };
    });
}

function ChangeDetail({ change }) {
  const list = differences(change.before, change.after);
  if (!list.length)
    return <span className="muted">Sin cambios en los datos visibles</span>;
  return (
    <ul className="change-detail">
      {list.map((item) => (
        <li key={item.field}>
          <strong>{fieldNames[item.field]}:</strong>{" "}
          {item.text !== undefined ? (
            item.text
          ) : item.added ? (
            <>
              {item.added.map((value) => (
                <span className="change-added" key={`+${value}`}>
                  + {value}
                </span>
              ))}
              {item.removed.map((value) => (
                <span className="change-removed" key={`-${value}`}>
                  − {value}
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="change-from">{item.from}</span>
              <Icon name="next" size={13} />
              <span className="change-to">{item.to}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

const recordName = (change) => {
  const state = change.after || change.before || {};
  return state.full_name || state.name || `#${change.entity_id}`;
};

// Tabla de cambios. `compact` omite la columna del registro (historial de uno solo).
export function ChangeTable({ items, timeZone, compact = false }) {
  if (!items.length)
    return (
      <Empty
        icon="history"
        title="Todavía no hay cambios registrados"
        description="Cada alta o edición desde el panel quedará aquí con su estado anterior y el nuevo."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Cambio</th>
            {!compact && <th>Registro</th>}
            <th>Detalle</th>
            <th>Realizado por</th>
            <th>Fecha y hora</th>
          </tr>
        </thead>
        <tbody>
          {items.map((change) => (
            <tr key={change.id}>
              <td>
                <span className="activity-cell">
                  <span className="event-icon">
                    <Icon name="history" size={16} />
                  </span>
                  <strong>{actionNames[change.action] || change.action}</strong>
                </span>
              </td>
              {!compact && (
                <td>
                  <div className="stack-cell">
                    <strong>{recordName(change)}</strong>
                    <small>{entityNames[change.entity]}</small>
                  </div>
                </td>
              )}
              <td>
                <ChangeDetail change={change} />
              </td>
              <td>
                <div className="person-cell">
                  <Avatar name={change.full_name || "?"} small />
                  <span>{change.full_name || "Sin identificar"}</span>
                </div>
              </td>
              <td className="nowrap muted">
                {dateTime(change.created_at, timeZone)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Historial de un solo registro, para el modal «Ver historial».
export function EntityHistory({ entity, id, timeZone }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/admin/changes?entity=${entity}&entity_id=${id}`)
      .then((result) => setItems(result.items))
      .catch((error) => setError(error.message));
  }, [entity, id]);
  return (
    <div className="editor-body history-body">
      <ErrorBox error={error} />
      {items ? (
        <ChangeTable items={items} timeZone={timeZone} compact />
      ) : (
        !error && <Loading />
      )}
    </div>
  );
}

export function AccessTable({ items, timeZone }) {
  if (!items.length)
    return (
      <Empty
        icon="eye"
        title="Todavía no hay accesos registrados"
        description="Cada vez que una aplicación pide abrir una pantalla, el resultado queda aquí."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pantalla</th>
            <th>Usuario</th>
            <th>Aplicación / Rol</th>
            <th>Resultado</th>
            <th>Fecha y hora</th>
          </tr>
        </thead>
        <tbody>
          {items.map((access) => (
            <tr key={access.id}>
              <td>
                <div className="stack-cell">
                  <strong>{access.screen_name || access.permission}</strong>
                  <small>
                    <code>{access.permission}</code>
                  </small>
                </div>
              </td>
              <td>
                <div className="stack-cell">
                  <strong>{access.full_name}</strong>
                  <small>{access.email}</small>
                </div>
              </td>
              <td>
                <div className="stack-cell">
                  <strong>{access.app_name}</strong>
                  <small>{access.role_name || "—"}</small>
                </div>
              </td>
              <td>
                <Badge tone={access.allowed ? "green" : "red"}>
                  {access.allowed ? "Permitido" : "Denegado"}
                </Badge>
              </td>
              <td className="nowrap muted">
                {dateTime(access.created_at, timeZone)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
