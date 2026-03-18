# Configuración de Secrets en GitHub Actions para Cloudflare Pages

## Problema actual
El despliegue falla porque faltan las variables de entorno de Supabase en GitHub Actions.

## Solución: Configurar Secrets en GitHub

Sigue estos pasos **en tu navegador**:

### 1. Abre la página de Settings del repositorio
```
https://github.com/jairodiazp-jpg/Cruze-contable/settings/secrets/actions
```

### 2. Haz clic en "New repository secret"

### 3. Añade estos 5 secrets (copia exactamente los nombres):

| Nombre | Valor | Dónde obtenerlo |
|--------|-------|-----------------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Tu Dashboard de Supabase → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJx...xxxxx` | Tu Dashboard de Supabase → Project Settings → API → anon key |
| `CLOUDFLARE_API_TOKEN` | `Tu token de Cloudflare` | Cloudflare Dashboard → My Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | `Tu Account ID` | Cloudflare Dashboard → Account Details → Account ID (derecha) |
| `CLOUDFLARE_PROJECT_NAME` | `tu-proyecto-contable` | Tu proyecto en Cloudflare Pages |

### 4. Después de agregar todos los Secrets:
- Haz un nuevo commit y push a main:
```bash
git -C "C:\Users\anny9\Downloads\intelisupp-aid-main\intelisupp-aid-main" log --oneline -n 1
git -C "C:\Users\anny9\Downloads\intelisupp-aid-main\intelisupp-aid-main" push origin main
```

### 5. El workflow se ejecutará automáticamente
- Ve a **Actions** en tu repo
- Verás el workflow ejecutándose
- Si todo está bien, debería buildear y deployar correctamente

## ¿Cómo obtener cada valor?

### Supabase
1. Abre https://supabase.com y ve a tu proyecto
2. Settings → API → URL y anon key

### Cloudflare
1. Ve a https://dash.cloudflare.com
2. Account Details → copiar Account ID
3. My Profile → API Tokens → Create Token (permiso: Pages Publish)

## Prueba rápida
Una vez configurados, haz:
```bash
git -C "C:\Users\anny9\Downloads\intelisupp-aid-main\intelisupp-aid-main" commit --allow-empty -m "trigger: github actions rebuild"
git -C "C:\Users\anny9\Downloads\intelisupp-aid-main\intelisupp-aid-main" push origin main
```

Esto ejecutará el workflow de nuevo con los Secrets correctos configurados.
