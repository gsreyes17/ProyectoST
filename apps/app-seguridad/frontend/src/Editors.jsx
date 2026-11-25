import { useState } from "react";
import { api } from "./api";
import { Field, Button, Toggle, CheckList, ErrorBox, Icon } from "./ui";

export default function Editor({
  type,
  item,
  apps,
  roles,
  menus,
  onSaved,
  onClose,
  adminMfaRequired = true,
}) {
  const editing = Boolean(item?.id);
  const firstApp = apps.find((app) => !app.is_internal)?.id || "";
  const defaults = {
    user: {
      email: "",
      full_name: "",
      password: "",
      active: true,
      mfa_required: true,
      app_ids: [],
      role_ids: [],
    },
    role: {
      app_id: firstApp,
      name: "",
      description: "",
      duration_minutes: 60,
      active: true,
      menu_ids: [],
    },
    menu: {
      app_id: firstApp,
      name: "",
      code: "",
      route: "",
      icon: "layout",
      position: 0,
      parent_id: null,
      active: true,
    },
    application: {
      name: "",
      slug: "",
      description: "",
      platform: "HTTP / JSON",
      active: true,
    },
    resetPassword: {
      admin_password: "",
      admin_code: "",
      new_password: "",
      identityConfirmed: false,
    },
    resetMfa: { admin_password: "", admin_code: "", identityConfirmed: false },
  };
  const [data, setData] = useState({
    ...defaults[type],
    ...(type.startsWith("reset") ? {} : item),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (name, value) =>
    setData((previous) => ({ ...previous, [name]: value }));
  const app = apps.find((app) => app.id === Number(data.app_id));
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let result;
      if (type === "user") {
        result = await api(`/admin/users${editing ? `/${item.id}` : ""}`, {
          method: editing ? "PATCH" : "POST",
          body: data,
        });
        const id = item?.id || result.id;
        const same = (a, b) =>
          [...a].sort().join(",") === [...b].sort().join(",");
        if (!editing || !same(data.app_ids, item.app_ids))
          await api(`/admin/users/${id}/applications`, {
            method: "PUT",
            body: { app_ids: data.app_ids },
          });
        if (!editing || !same(data.role_ids, item.role_ids))
          await api(`/admin/users/${id}/roles`, {
            method: "PUT",
            body: { role_ids: data.role_ids },
          });
      } else if (type.startsWith("reset")) {
        result = await api(
          `/admin/users/${item.id}/${type === "resetMfa" ? "reset-mfa" : "reset-password"}`,
          { method: "POST", body: data },
        );
      } else {
        const endpoint = {
          role: "roles",
          menu: "menus",
          application: "applications",
        }[type];
        const body =
          type === "menu" ? { ...data, route: data.route || null } : data;
        result = await api(
          `/admin/${endpoint}${editing ? `/${item.id}` : ""}`,
          { method: editing ? "PATCH" : "POST", body },
        );
      }
      onSaved(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const appSelect = (
    <Field label="Aplicación">
      <select
        value={data.app_id}
        disabled={editing}
        required
        onChange={(event) => {
          field("app_id", Number(event.target.value));
          field("menu_ids", []);
          field("parent_id", null);
        }}
      >
        <option value="" disabled>
          Selecciona una aplicación
        </option>
        {apps
          .filter((app) => !app.is_internal || app.id === item?.app_id)
          .map((app) => (
            <option value={app.id} key={app.id}>
              {app.name}
            </option>
          ))}
      </select>
    </Field>
  );
  return (
    <form onSubmit={save} className="editor-form">
      <div className="editor-body">
        <ErrorBox error={error} />
        {type === "user" && (
          <>
            <Field
              label="Nombre completo"
              required
              value={data.full_name}
              onChange={(event) => field("full_name", event.target.value)}
              maxLength={160}
            />
            <Field
              label="Correo corporativo"
              type="email"
              required
              value={data.email}
              onChange={(event) => field("email", event.target.value)}
              maxLength={180}
            />
            {!editing && (
              <Field
                label="Contraseña inicial"
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={data.password}
                onChange={(event) => field("password", event.target.value)}
                hint="Al menos 12 caracteres. Compártela por un canal seguro."
              />
            )}
            <Toggle
              label="Usuario habilitado"
              checked={data.active}
              onChange={(value) => field("active", value)}
            />
            <Toggle
              label="Exigir doble factor"
              checked={data.mfa_required}
              onChange={(value) => field("mfa_required", value)}
            />
            <p className="muted">
              {data.mfa_required
                ? "Se pedirá el autenticador o su configuración al ingresar."
                : "El usuario ingresará con contraseña, sin pedir código ni QR."}{" "}
              Esta opción aplica a todas sus aplicaciones.
            </p>
            <div className="form-section-title">Aplicaciones habilitadas</div>
            <CheckList
              items={apps}
              selected={data.app_ids}
              onChange={(value) => {
                field("app_ids", value);
                field(
                  "role_ids",
                  data.role_ids.filter((id) =>
                    roles.some(
                      (role) => role.id === id && value.includes(role.app_id),
                    ),
                  ),
                );
              }}
            />
            <div className="form-section-title">Roles asignados</div>
            <CheckList
              items={roles
                .filter((role) => data.app_ids.includes(role.app_id))
                .map((role) => ({
                  ...role,
                  subtitle: `${role.app_name} · ${role.duration_minutes} minutos`,
                }))}
              selected={data.role_ids}
              onChange={(value) => field("role_ids", value)}
            />
            {editing && (
              <div className="info-box">
                Cambiar aplicaciones, roles o la exigencia de doble factor
                cierra las sesiones del usuario.
              </div>
            )}
          </>
        )}
        {type === "role" && (
          <>
            {appSelect}
            <Field
              label="Nombre del rol"
              required
              value={data.name}
              maxLength={80}
              onChange={(event) => field("name", event.target.value)}
            />
            <Field label="Descripción">
              <textarea
                value={data.description}
                maxLength={300}
                rows={2}
                onChange={(event) => field("description", event.target.value)}
              />
            </Field>
            <Field
              label="Duración de sesión (minutos)"
              type="number"
              min={1}
              max={1440}
              required
              value={data.duration_minutes}
              onChange={(event) =>
                field("duration_minutes", Number(event.target.value))
              }
              hint="300 minutos = 5 horas · 60 minutos = 1 hora. Se cuenta desde el ingreso y no se renueva al navegar."
            />
            <div className="duration-presets">
              {[1, 60, 300].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={data.duration_minutes === value ? "selected" : ""}
                  onClick={() => field("duration_minutes", value)}
                >
                  {value === 1
                    ? "1 min · Prueba"
                    : value === 60
                      ? "1 hora"
                      : "5 horas"}
                </button>
              ))}
            </div>
            <Toggle
              label="Rol habilitado"
              checked={data.active}
              onChange={(value) => field("active", value)}
            />
            {!item?.is_system_admin && (
              <>
                <div className="form-section-title">
                  Opciones de menú autorizadas
                </div>
                <CheckList
                  items={menus
                    .filter(
                      (menu) =>
                        menu.app_id === Number(data.app_id) && menu.route,
                    )
                    .map((menu) => ({ ...menu, subtitle: menu.route }))}
                  selected={data.menu_ids}
                  onChange={(value) => field("menu_ids", value)}
                />
              </>
            )}
            {editing && (
              <div className="info-box">
                Modificar la duración cierra las sesiones de este rol. Los
                permisos se aplican en la siguiente petición.
              </div>
            )}
          </>
        )}
        {type === "menu" && (
          <>
            {appSelect}
            <Field
              label="Nombre visible"
              required
              value={data.name}
              onChange={(event) => field("name", event.target.value)}
              maxLength={100}
            />
            <Field
              label="Código de autorización"
              required
              disabled={editing}
              placeholder={`${app?.slug || "app"}.opcion`}
              value={data.code}
              pattern="[a-z][a-z0-9_.\-]{1,79}"
              onChange={(event) => field("code", event.target.value)}
              hint="Identificador estable que también debe conocer el backend de la aplicación."
            />
            <div className="form-grid">
              <Field label="Grupo padre">
                <select
                  value={data.parent_id || ""}
                  onChange={(event) =>
                    field(
                      "parent_id",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Sin grupo (raíz)</option>
                  {menus
                    .filter(
                      (menu) =>
                        menu.app_id === Number(data.app_id) &&
                        !menu.parent_id &&
                        !menu.route &&
                        menu.id !== item?.id,
                    )
                    .map((menu) => (
                      <option value={menu.id} key={menu.id}>
                        {menu.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Orden"
                type="number"
                min={0}
                max={1000}
                value={data.position}
                onChange={(event) =>
                  field("position", Number(event.target.value))
                }
              />
            </div>
            <Field
              label="Ruta de la pantalla"
              placeholder="/clientes"
              value={data.route || ""}
              onChange={(event) => field("route", event.target.value)}
              hint="Deja vacío para un grupo. La pantalla debe existir en el cliente."
            />
            <Field label="Icono">
              <select
                value={data.icon}
                onChange={(event) => field("icon", event.target.value)}
              >
                {[
                  "layout",
                  "users",
                  "package",
                  "chart",
                  "file",
                  "activity",
                  "layers",
                ].map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle
              label="Menú habilitado"
              checked={data.active}
              onChange={(value) => field("active", value)}
            />
          </>
        )}
        {type === "application" && (
          <>
            <Field
              label="Nombre de la aplicación"
              required
              value={data.name}
              onChange={(event) => field("name", event.target.value)}
            />
            <Field
              label="Identificador"
              required
              disabled={editing}
              value={data.slug}
              onChange={(event) => field("slug", event.target.value)}
              pattern="[a-z][a-z0-9\-]{1,49}"
              hint="Identificador estable, por ejemplo: crm."
            />
            <Field
              label="Plataforma"
              required
              value={data.platform}
              onChange={(event) => field("platform", event.target.value)}
            />
            <Field label="Descripción">
              <textarea
                value={data.description}
                maxLength={300}
                rows={3}
                onChange={(event) => field("description", event.target.value)}
              />
            </Field>
            <Toggle
              label="Aplicación habilitada"
              checked={data.active}
              onChange={(value) => field("active", value)}
            />
            {!editing && (
              <div className="info-box">
                Al guardar se mostrará una credencial de integración una sola
                vez.
              </div>
            )}
          </>
        )}
        {type.startsWith("reset") && (
          <>
            <div className="warning-box">
              <Icon name="alert" size={20} />
              <span>
                Esta operación cierra las sesiones de{" "}
                <strong>{item.full_name}</strong>. Verifica su identidad antes
                de continuar.
              </span>
            </div>
            <label className="checkbox-line">
              <input
                type="checkbox"
                required
                checked={data.identityConfirmed}
                onChange={(event) =>
                  field("identityConfirmed", event.target.checked)
                }
              />
              He verificado la identidad del usuario
            </label>
            {type === "resetPassword" && (
              <Field
                label="Nueva contraseña del usuario"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={data.new_password}
                onChange={(event) => field("new_password", event.target.value)}
              />
            )}
            <Field
              label="Tu contraseña de administrador"
              type="password"
              autoComplete="current-password"
              required
              value={data.admin_password}
              onChange={(event) => field("admin_password", event.target.value)}
            />
            {adminMfaRequired && (
              <Field
                label="Código nuevo de tu autenticador"
                required
                inputMode="numeric"
                minLength={6}
                maxLength={6}
                value={data.admin_code}
                onChange={(event) => field("admin_code", event.target.value)}
                hint="Espera un código que todavía no hayas utilizado."
              />
            )}
          </>
        )}
      </div>
      <footer className="modal-actions">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" busy={busy} icon="check">
          {type.startsWith("reset")
            ? "Confirmar restablecimiento"
            : "Guardar cambios"}
        </Button>
      </footer>
    </form>
  );
}
