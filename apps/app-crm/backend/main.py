"""Cliente CRM: adapta la API central; no maneja contraseñas ni permisos propios."""
from pathlib import Path
import hashlib
import hmac
import json
import os
from urllib.request import Request as HttpRequest, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from starlette.concurrency import run_in_threadpool
from dotenv import load_dotenv
import psycopg

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
SETTINGS = json.loads((ROOT / 'app.json').read_text(encoding='utf-8'))
SETTINGS.update(id=int(os.environ['APP_ID']), key=os.environ['APP_KEY'], port=int(os.environ.get('PORT', '5001')))
CORE_URL = os.environ['CORE_URL']
DATABASE_URL = os.environ['DATABASE_URL']
FRONTEND = (ROOT.parent / 'frontend/dist').resolve()
COOKIE = 'st_demo_crm_session'
SECURE = os.environ.get('COOKIE_SECURE', 'false') == 'true'
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def csrf(token):
    return hmac.new(SETTINGS['key'].encode(), f'csrf:{token}'.encode(), hashlib.sha256).hexdigest()


def core(endpoint, method, token, body=None):
    headers = {'X-App-Id': str(SETTINGS['id']), 'X-App-Key': SETTINGS['key'], 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = HttpRequest(CORE_URL + '/api/v1' + endpoint, method=method,
                          headers=headers, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urlopen(request, timeout=5) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.loads(error.read())
    except (URLError, TimeoutError, OSError, ValueError):
        return 503, {'error': 'El servicio de seguridad no está disponible. Intenta nuevamente.'}


async def upstream(request, endpoint, method='GET', body=None):
    return await run_in_threadpool(core, endpoint, method, request.cookies.get(COOKIE), body)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    origin = request.headers.get('origin')
    ports = [SETTINGS['port'], int(os.environ.get('FRONTEND_PORT', '5174'))]
    allowed = [f'http://{host}:{port}' for port in ports for host in ('localhost', '127.0.0.1')]
    if request.method not in ('GET', 'HEAD') and origin and origin not in allowed:
        return JSONResponse({'error': 'Origen no permitido.'}, status_code=403)
    if int(request.headers.get('content-length', '0')) > 24576:
        return JSONResponse({'error': 'La solicitud es demasiado grande.'}, status_code=413)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    if request.url.path.startswith('/api') or not request.url.path.startswith('/assets'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/api/v1/public/config')
async def public_config(request: Request):
    status, data = await upstream(request, '/public/config')
    data.update(mode='demo', appName=SETTINGS['name'], slug='crm', color=SETTINGS['color'], description=SETTINGS['description'])
    return JSONResponse(data, status_code=status)


@app.post('/api/v1/auth/{endpoint:path}')
async def authentication(endpoint: str, request: Request):
    allowed = {'login-step1', 'login-step2', 'mfa/enroll', 'mfa/confirm', 'select-role', 'logout'}
    if endpoint not in allowed:
        return JSONResponse({'error': 'Endpoint no disponible.'}, status_code=404)
    if endpoint == 'logout':
        token = request.cookies.get(COOKIE)
        if not token or not hmac.compare_digest(request.headers.get('X-CSRF-Token', ''), csrf(token)):
            return JSONResponse({'error': 'Verificación de solicitud inválida.'}, status_code=403)
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse({'error': 'Datos JSON inválidos.'}, status_code=400)
    status, data = await upstream(request, '/auth/' + endpoint, 'POST', body)
    session = data.pop('sessionToken', None)
    if session:
        data['csrfToken'] = csrf(session)
    response = JSONResponse(data, status_code=status)
    if session:
        expires = datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00'))
        response.set_cookie(COOKIE, session, httponly=True, secure=SECURE, samesite='lax', expires=expires)
    if endpoint == 'logout':
        response.delete_cookie(COOKIE, httponly=True, secure=SECURE, samesite='lax')
    return response


@app.get('/api/v1/me')
async def me(request: Request):
    status, data = await upstream(request, '/me')
    if status == 200:
        data['csrfToken'] = csrf(request.cookies[COOKIE])
    return JSONResponse(data, status_code=status)


@app.get('/api/v1/navigation/menus')
async def navigation(request: Request):
    status, data = await upstream(request, '/navigation/menus')
    return JSONResponse(data, status_code=status)


async def authorize_page(request, route):
    page = next((page for page in SETTINGS['pages'] if page['route'] == route), None)
    if not page:
        return 404, {'error': 'Página no encontrada.'}
    status, data = await upstream(request, '/auth/introspect', 'POST', {'permission': page['code']})
    return (200, {**page, 'iam_user_id': data['session']['user_id']}) if status == 200 else (status, data)


@app.get('/api/v1/demo/page')
async def page_data(request: Request, path: str = '/'):
    status, data = await authorize_page(request, path)
    if status != 200:
        return JSONResponse(data, status_code=status)
    try:
        record = await run_in_threadpool(record_access, data['iam_user_id'], data)
        return JSONResponse({**data, **record})
    except psycopg.Error:
        return JSONResponse({'error': 'La base de datos del CRM no esta disponible.'}, status_code=503)


def record_access(user_id, page):
    with psycopg.connect(DATABASE_URL, connect_timeout=3) as connection:
        row = connection.execute('INSERT INTO integration_access(iam_user_id,permission_code,route) VALUES(%s,%s,%s) RETURNING id,current_database()',
                                 (user_id, page['code'], page['route'])).fetchone()
        return {'access_id': row[0], 'database': row[1]}


def database_status(user_id):
    with psycopg.connect(DATABASE_URL, connect_timeout=3) as connection:
        row = connection.execute('SELECT current_database(),current_user,(SELECT count(*) FROM integration_access WHERE iam_user_id=%s)', (user_id,)).fetchone()
        return {'application': 'crm', 'database': row[0], 'database_user': row[1], 'own_accesses': row[2]}


@app.get('/api/v1/integration/status')
async def integration_status(request: Request):
    status, data = await upstream(request, '/auth/introspect', 'POST', {})
    if status != 200:
        return JSONResponse(data, status_code=status)
    try:
        return await run_in_threadpool(database_status, data['session']['user_id'])
    except psycopg.Error:
        return JSONResponse({'error': 'La base de datos del CRM no esta disponible.'}, status_code=503)


# --- Registros de cada pantalla ---------------------------------------------
# Cada operación solicita a IAM su capacidad exacta (`<pantalla>.<accion>`)
# antes de consultar la base. Ocultar el botón en React no autoriza nada.
INVALID_RECORD = {'error': 'Completa todos los campos con valores válidos.'}
NOT_FOUND = {'error': 'Registro no encontrado.'}


def valid_csrf(request):
    token = request.cookies.get(COOKIE)
    return bool(token) and hmac.compare_digest(request.headers.get('X-CSRF-Token', ''), csrf(token))


async def authorize_action(request, action):
    """Devuelve (200, acceso) o (estado, error). `acceso` incluye las columnas permitidas."""
    route = request.query_params.get('path', '')
    page = next((page for page in SETTINGS['pages'] if page['route'] == route), None)
    if not page or action not in page['actions']:
        return 404, {'error': 'Operación no disponible.'}
    status, data = await upstream(request, '/auth/introspect', 'POST', {'permission': f"{page['code']}.{action}"})
    if status != 200:
        return status, data
    # Las columnas protegidas solo se leen o escriben con su propia capacidad.
    granted = set(data.get('capabilities', []))
    columns = [column for column in page['columns']
               if not column.get('protected') or f"{page['code']}.col.{column['key']}" in granted]
    return 200, {'page': page, 'user_id': data['session']['user_id'], 'columns': columns}


def clean_record(columns, body):
    source = body.get('data') if isinstance(body, dict) else None
    if not isinstance(source, dict):
        return None
    record = {}
    for column in columns:
        value = source.get(column['key'])
        if column['type'] == 'number':
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or abs(value) == float('inf'):
                return None
        else:
            if not isinstance(value, str):
                return None
            value = value.strip()
            if not value or len(value) > 120:
                return None
            if column['type'] == 'date':
                try:
                    datetime.strptime(value, '%Y-%m-%d')
                except ValueError:
                    return None
        record[column['key']] = value
    return record


def query(sql, parameters, fetch=True):
    with psycopg.connect(DATABASE_URL, connect_timeout=3) as connection:
        cursor = connection.execute(sql, parameters)
        return cursor.fetchall() if fetch else cursor.rowcount


async def read_body(request):
    try:
        return await request.json()
    except ValueError:
        return None


@app.get('/api/v1/records')
async def list_records(request: Request):
    status, access = await authorize_action(request, 'exportar' if request.query_params.get('export') == '1' else 'ver')
    if status != 200:
        return JSONResponse(access, status_code=status)
    try:
        rows = await run_in_threadpool(query, 'SELECT id,data,updated_at FROM records WHERE module=%s ORDER BY id LIMIT 500',
                                       (access['page']['code'],))
    except psycopg.Error:
        return JSONResponse({'error': 'La base de datos del CRM no esta disponible.'}, status_code=503)
    columns = access['columns']
    return {
        'columns': [{'key': column['key'], 'label': column['label'], 'type': column['type']} for column in columns],
        'items': [{'id': row[0], 'updated_at': row[2].isoformat(),
                   'data': {column['key']: row[1].get(column['key']) for column in columns}} for row in rows],
    }


@app.post('/api/v1/records')
async def create_record(request: Request):
    if not valid_csrf(request):
        return JSONResponse({'error': 'Verificación de solicitud inválida.'}, status_code=403)
    status, access = await authorize_action(request, 'crear')
    if status != 200:
        return JSONResponse(access, status_code=status)
    record = clean_record(access['columns'], await read_body(request))
    if record is None:
        return JSONResponse(INVALID_RECORD, status_code=400)
    try:
        rows = await run_in_threadpool(query, 'INSERT INTO records(module,data,iam_user_id) VALUES(%s,%s::jsonb,%s) RETURNING id',
                                       (access['page']['code'], json.dumps(record), access['user_id']))
    except psycopg.Error:
        return JSONResponse({'error': 'La base de datos del CRM no esta disponible.'}, status_code=503)
    return JSONResponse({'id': rows[0][0]}, status_code=201)


@app.patch('/api/v1/records/{record_id}')
async def update_record(record_id: str, request: Request):
    if not valid_csrf(request):
        return JSONResponse({'error': 'Verificación de solicitud inválida.'}, status_code=403)
    if not (record_id.isascii() and record_id.isdigit() and len(record_id) <= 15):
        return JSONResponse(NOT_FOUND, status_code=404)
    status, access = await authorize_action(request, 'editar')
    if status != 200:
        return JSONResponse(access, status_code=status)
    record = clean_record(access['columns'], await read_body(request))
    if record is None:
        return JSONResponse(INVALID_RECORD, status_code=400)
    try:
        # La fusión conserva las columnas protegidas que este rol no puede ver.
        changed = await run_in_threadpool(query, 'UPDATE records SET data=data||%s::jsonb,updated_at=NOW() WHERE id=%s AND module=%s',
                                          (json.dumps(record), int(record_id), access['page']['code']), False)
    except psycopg.Error:
        return JSONResponse({'error': 'La base de datos del CRM no esta disponible.'}, status_code=503)
    return {'id': int(record_id)} if changed else JSONResponse(NOT_FOUND, status_code=404)


@app.delete('/api/v1/records/{record_id}')
async def delete_record(record_id: str, request: Request):
    if not valid_csrf(request):
        return JSONResponse({'error': 'Verificación de solicitud inválida.'}, status_code=403)
    if not (record_id.isascii() and record_id.isdigit() and len(record_id) <= 15):
        return JSONResponse(NOT_FOUND, status_code=404)
    status, access = await authorize_action(request, 'eliminar')
    if status != 200:
        return JSONResponse(access, status_code=status)
    try:
        changed = await run_in_threadpool(query, 'DELETE FROM records WHERE id=%s AND module=%s',
                                          (int(record_id), access['page']['code']), False)
    except psycopg.Error:
        return JSONResponse({'error': 'La base de datos del CRM no esta disponible.'}, status_code=503)
    return {'ok': True} if changed else JSONResponse(NOT_FOUND, status_code=404)


@app.api_route('/api/{endpoint:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
async def unknown_api(endpoint: str):
    return JSONResponse({'error': 'Endpoint no disponible.'}, status_code=404)


@app.get('/{route:path}')
async def frontend(route: str, request: Request):
    if route.startswith('assets/') or route == 'favicon.svg':
        target = (FRONTEND / route).resolve()
        if FRONTEND in target.parents and target.is_file():
            return FileResponse(target)
        return JSONResponse({'error': 'Archivo no encontrado.'}, status_code=404)
    status = 200 if not route else (await authorize_page(request, '/' + route))[0]
    return FileResponse(FRONTEND / 'index.html', status_code=status)
