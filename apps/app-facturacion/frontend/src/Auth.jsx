import { useEffect, useState } from "react";
import { api } from "./api";
import { Icon, Button, Field, ErrorBox, Loading, duration } from "./ui";

export default function Auth({ config, onAuthenticated, notice }) {
  const [flow, setFlow] = useState({ state: "PASSWORD" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const isDemo = config.mode === "demo";
  useEffect(() => {
    if (flow.state !== "ENROLL_REQUIRED") return;
    api("/auth/mfa/enroll", {
      method: "POST",
      body: { challenge: flow.challenge },
    })
      .then(setEnrollment)
      .catch((error) => setError(error.message));
  }, [flow.state, flow.challenge]);
  async function submit(event, roleId) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      let result;
      if (flow.state === "PASSWORD")
        result = await api("/auth/login-step1", {
          method: "POST",
          body: { email, password },
        });
      else if (flow.state === "ROLE_REQUIRED")
        result = await api("/auth/select-role", {
          method: "POST",
          body: { selection: flow.selection, role_id: roleId },
        });
      else
        result = await api(
          flow.state === "ENROLL_REQUIRED"
            ? "/auth/mfa/confirm"
            : "/auth/login-step2",
          { method: "POST", body: { challenge: flow.challenge, code } },
        );
      setPassword("");
      setCode("");
      setSavedCodes(false);
      if (result.state === "AUTHENTICATED" && !result.recoveryCodes?.length)
        await onAuthenticated();
      else setFlow(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  function downloadCodes() {
    const blob = new Blob(
      [
        `Códigos de recuperación — ${config.appName}\nCuenta: ${email}\nCada código solo puede utilizarse una vez. Guarda este archivo en un lugar seguro.\n\n${flow.recoveryCodes.join("\n")}\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "codigos-recuperacion.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const showingCodes = flow.recoveryCodes?.length && !savedCodes;
  return (
    <div
      className={`auth-layout ${isDemo ? `demo-${config.slug}` : ""}`}
      style={{ "--accent": config.color || "#4f46e5" }}
    >
      <aside className="auth-story">
        <a className="brand auth-brand" href="/">
          <span className="brand-symbol">
            <Icon name={isDemo ? "apps" : "shield"} size={25} />
          </span>
          <span>
            {isDemo ? config.appName : "Seguridad"}
            <small>
              {isDemo ? "Aplicación de demostración" : "TRANSVERSAL"}
            </small>
          </span>
        </a>
        <div className="auth-story-content">
          <span className="eyebrow light">
            <span className="live-dot" />
            CONTROL DE ACCESO CENTRALIZADO
          </span>
          <h1>
            {isDemo ? (
              config.description
            ) : (
              <>
                Un solo lugar.
                <br />
                Todo bajo control.
              </>
            )}
          </h1>
          <p>
            {isDemo
              ? "Una experiencia de acceso compartida. Tus menús y páginas se adaptan a tu rol."
              : "Administra identidades, define permisos y protege el acceso a todas tus aplicaciones."}
          </p>
          <div className="security-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="orbit-icon orbit-user">
              <Icon name="users" size={27} />
            </div>
            <div className="orbit-icon orbit-key">
              <Icon name="key" size={25} />
            </div>
            <div className="orbit-icon orbit-app">
              <Icon name="apps" size={25} />
            </div>
            <div className="shield-center">
              <Icon name="shield" size={70} />
            </div>
            <span className="illustration-label">
              <Icon name="check" size={15} />
              Identidad verificada
            </span>
          </div>
          <div className="auth-benefits">
            <span>
              <Icon name="fingerprint" />
              Doble factor
            </span>
            <span>
              <Icon name="roles" />
              Acceso por rol
            </span>
            <span>
              <Icon name="sessions" />
              Sesiones seguras
            </span>
          </div>
        </div>
        <span className="auth-story-footer">
          {config.companyName} <span>Seguridad que conecta.</span>
        </span>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <span>{config.companyName}</span>
          <span className="auth-security-label">
            <Icon name="lock" size={14} />
            Acceso protegido
          </span>
        </div>
        <div className="auth-form-area">
          <div className="auth-step-icon">
            <Icon
              name={
                showingCodes
                  ? "key"
                  : flow.state === "PASSWORD"
                    ? "lock"
                    : flow.state === "ROLE_REQUIRED"
                      ? "roles"
                      : "fingerprint"
              }
              size={27}
            />
          </div>
          <span className="eyebrow">
            {isDemo ? config.appName : "PORTAL DE ADMINISTRACIÓN"}
          </span>
          <h2>
            {showingCodes
              ? "Guarda tu acceso de respaldo"
              : flow.state === "PASSWORD"
                ? "Bienvenido de nuevo"
                : flow.state === "ENROLL_REQUIRED"
                  ? "Protege tu cuenta"
                  : flow.state === "ROLE_REQUIRED"
                    ? "Elige cómo ingresar"
                    : "Verifica tu identidad"}
          </h2>
          <p className="auth-description">
            {showingCodes
              ? "Estos códigos se muestran una sola vez. Úsalos si pierdes acceso a tu autenticador."
              : flow.state === "PASSWORD"
                ? "Ingresa tus credenciales para continuar."
                : flow.state === "ENROLL_REQUIRED"
                  ? "Escanea el QR con Google Authenticator, Microsoft Authenticator u otra app compatible."
                  : flow.state === "ROLE_REQUIRED"
                    ? "Tu rol determina los menús disponibles y la duración de tu sesión."
                    : "Escribe el código de tu autenticador para completar el acceso."}
          </p>
          {notice && flow.state === "PASSWORD" && (
            <div className="info-box">{notice}</div>
          )}
          <ErrorBox error={error} />
          {showingCodes ? (
            <>
              <div className="recovery-grid">
                {flow.recoveryCodes.map((value) => (
                  <code key={value}>{value}</code>
                ))}
              </div>
              <Button variant="secondary" icon="file" onClick={downloadCodes}>
                Descargar códigos
              </Button>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={savedCodes}
                  onChange={async (event) => {
                    if (event.target.checked) {
                      setSavedCodes(true);
                      if (flow.state === "AUTHENTICATED")
                        await onAuthenticated();
                    }
                  }}
                />
                He guardado mis códigos en un lugar seguro
              </label>
            </>
          ) : flow.state === "ROLE_REQUIRED" ? (
            <div className="role-options">
              {flow.roles.map((role) => (
                <button
                  key={role.id}
                  disabled={busy}
                  onClick={(event) => submit(event, role.id)}
                >
                  <span className="role-option-icon">
                    <Icon name="roles" />
                  </span>
                  <span>
                    <strong>{role.name}</strong>
                    <small>Sesión de {duration(role.duration_minutes)}</small>
                  </span>
                  <Icon name="next" size={18} />
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={submit}>
              {flow.state === "PASSWORD" ? (
                <>
                  <Field
                    label="Correo corporativo"
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder={`tu.nombre@${config.domains?.[0] || "empresa.test"}`}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <Field label="Contraseña">
                    <div className="password-field">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Ingresa tu contraseña"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        maxLength={128}
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Ocultar contraseña"
                            : "Mostrar contraseña"
                        }
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <Icon
                          name={showPassword ? "eyeoff" : "eye"}
                          size={18}
                        />
                      </button>
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  {flow.state === "ENROLL_REQUIRED" &&
                    (enrollment ? (
                      <div className="qr-enrollment">
                        <img
                          src={enrollment.qr}
                          alt="Código QR para enrolar tu autenticador"
                          width="190"
                          height="190"
                        />
                        <details>
                          <summary>Ingresar la clave manualmente</summary>
                          <code>{enrollment.secret}</code>
                        </details>
                      </div>
                    ) : (
                      <Loading />
                    ))}
                  <Field
                    label={
                      recovery
                        ? "Código de recuperación"
                        : "Código del autenticador"
                    }
                    hint={
                      recovery
                        ? "Cada código de recuperación solo funciona una vez."
                        : "El código cambia cada 30 segundos."
                    }
                  >
                    <input
                      className="otp-input"
                      name="otp"
                      autoComplete="one-time-code"
                      inputMode={recovery ? "text" : "numeric"}
                      placeholder={recovery ? "xxxx-xxxx-xxxx-xxxx" : "000000"}
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      required
                      maxLength={recovery ? 19 : 6}
                      minLength={6}
                      autoFocus
                    />
                  </Field>
                  {flow.state === "MFA_REQUIRED" && (
                    <button
                      type="button"
                      className="text-button recovery-link"
                      onClick={() => {
                        setRecovery(!recovery);
                        setCode("");
                      }}
                    >
                      {recovery
                        ? "Usar mi autenticador"
                        : "Usar un código de recuperación"}
                    </button>
                  )}
                </>
              )}
              <Button
                className="full-width"
                busy={busy}
                icon="next"
                type="submit"
                disabled={flow.state === "ENROLL_REQUIRED" && !enrollment}
              >
                {flow.state === "PASSWORD"
                  ? "Continuar"
                  : "Verificar y continuar"}
              </Button>
            </form>
          )}
          {flow.state !== "PASSWORD" && !showingCodes && (
            <button
              className="text-button back-login"
              onClick={() => {
                setFlow({ state: "PASSWORD" });
                setEnrollment(null);
                setError("");
                setCode("");
              }}
            >
              Volver al inicio de sesión
            </button>
          )}
          <div className="auth-note">
            <Icon name="shield" size={17} />
            <span>
              {isDemo
                ? "Identidad, permisos y sesión validados por el portal transversal."
                : "El doble factor se solicita según la configuración de tu cuenta."}
            </span>
          </div>
        </div>
        <footer className="auth-footer">
          <span>{config.appName}</span>
          <span>Acceso exclusivo para usuarios autorizados</span>
        </footer>
      </main>
    </div>
  );
}
