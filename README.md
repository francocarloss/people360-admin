# People 360 Admin

Consola web Admin/RRHH para People 360 publicada con GitHub Pages.

## Publicar en GitHub Pages

1. Entra al repositorio en GitHub.
2. Ve a Settings > Pages.
3. En Build and deployment selecciona Source: Deploy from a branch.
4. Selecciona Branch: main y carpeta: / root.
5. Guarda los cambios.

La URL esperada sera:

https://francocarloss.github.io/people360-admin/

## Pruebas despues de publicar

- Abrir la URL publicada.
- Iniciar sesion con un usuario admin o RRHH.
- Validar Dashboard, Empleados, Ubicaciones, Capsulas, Solicitudes, Notificaciones y Reportes.
- Crear una capsula o ubicacion de prueba y confirmar que se guarda en Supabase.

## Seguridad

Esta consola usa la publishable/anon key de Supabase. No contiene SERVICE_ROLE_KEY. Las operaciones sensibles dependen de RLS y Edge Functions.
