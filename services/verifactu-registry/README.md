# Registro compartido VERI*FACTU de prácticas

Servicio independiente para consultar el QR desde un dispositivo que no tiene la práctica local. Es una simulación educativa: confirma la recepción de metadatos en este registro, no la validez fiscal de una factura ni una presentación ante la AEAT.

## Activación con cuenta propia

[Instalar el registro en Cloudflare](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fsandeeacocina-lab%2Faula-simulacion%2Ftree%2Fverifactu-registro-compartido%2Fservices%2Fverifactu-registry)

El asistente requiere entrar en Cloudflare y conectar la cuenta GitHub. Copia únicamente este servicio a un repositorio nuevo, crea el Worker y la base D1 y sustituye el identificador de ejemplo en `wrangler.jsonc`. Acepta los nombres propuestos, conserva `ALLOWED_ORIGINS` y usa la modalidad gratuita. El script `deploy` aplica las migraciones antes de publicar. No se necesita modificar DNS ni la web principal para instalar este servicio.

Tras el despliegue, comprueba que `https://NOMBRE.SUBDOMINIO.workers.dev/health` devuelve `service: aula-verifactu-registry`, `version: 1`, `mode: educational`. La URL concreta la genera Cloudflare; no se incluye ninguna dirección inventada en la central.

Para conectar la central se introduce ese origen HTTPS en `public/verifactu-registry.json`, se compila el frontend y se publica `docs/` en GitHub Pages. El archivo de configuración solo contiene `{"version":1,"url":"https://...workers.dev"}`: nunca una clave de Cloudflare. Con `url` vacío se conserva la consulta local.

## Funcionamiento

- Al emitir, subsanar o anular, primero se guarda el registro en el navegador. Después se transmite el metadato de cotejo. Si falla la conexión, queda pendiente y se puede reintentar sin duplicarlo.
- Solo se envían identificadores aleatorios, NIF ficticio del emisor, número, fecha, total, huellas, actuación, estado y presencia de firma simulada. Los PDF, clientes, conceptos, domicilios y cuentas bancarias permanecen en la práctica local.
- Cada práctica tiene una credencial aleatoria de 256 bits. Su identificador público se deriva mediante SHA-256 con separación de dominio. El QR no contiene la credencial.
- El servidor valida la credencial, secuencia, estados e inmutabilidad de los datos de cotejo. Guarda fecha de recepción y rechaza reemplazos. La huella del registro local es un dato recibido: el servidor no recibe ni recalcula la factura completa.
- Los GET de cotejo son públicos para quien tenga el enlace con sus identificadores. No hay listados públicos ni consultas por NIF o número.
- El estado compartido se consulta sin caché. Una consulta fallida nunca se sustituye por un éxito local que podría estar desactualizado.
- Las facturas ya descargadas con el QR local deben descargarse de nuevo después de enviar sus registros. Su número y contenido económico se conservan.

## Copias y prácticas

«Descargar copia de la práctica» conserva la credencial de continuación: es una copia propia. Para repartir un ejercicio se usa «Descargar como punto de partida», que la excluye. Al importar una copia se crea un registro independiente por defecto. «Continuar esta misma práctica» conserva el registro original y debe usarse con una copia propia y reciente.

Reiniciar VERI*FACTU elimina los datos locales y comienza otra identidad de registro. Los envíos anteriores quedan como historial compartido; conservar una copia propia permite retomarlos. La eliminación o archivo de esos registros compartidos es una operación de administración de la base D1, no una anulación fiscal. Antes de borrar registros en D1, archivar una copia de la base y planificar el efecto sobre los QR.

## Límites de la prueba

Cuerpo máximo de 8 KiB, 5.000 registros por práctica y 100.000 registros en todo el servicio. Al alcanzar el límite se interrumpe la incorporación y se conserva la copia local. Estos límites son de aplicación y no sustituyen los límites diarios del proveedor. No se contrata ni activa un plan de pago desde el código. Las observaciones de Wrangler están desactivadas y el Worker no registra las credenciales en logs.

Es un simulador abierto, no un sistema de identificación del alumno. La posesión de la copia propia permite continuar esa práctica; no acredita la autoría académica de su contenido. Para un despliegue masivo abierto deberán revisarse control de altas, caducidad y supervisión de consumo.

## Desarrollo y verificación

Requiere Node 22.13 o posterior. Desde este directorio: `npm ci`, `npm run db:local` y `npm run dev`. El entorno local escucha en `http://127.0.0.1:8787` y admite el frontend de desarrollo en el puerto 5173. `npm run build` empaqueta el Worker sin publicarlo.

Desde la raíz de la central: `npx vitest run tests/verifactu-registry.test.ts tests/verifactu.test.ts tests/local.test.ts tests/workspaces.test.ts tests/ui.test.tsx` y `npm run build`.

Comprobado también con el runtime local de Workers/D1 y dos contextos de navegador: importación del PDF de siete páginas, firma, factura ordinaria de 2.247,78 €, rectificativa de −181,50 €, consulta sin copia local, propagación de anulación y fallo de conexión sin falso éxito.

Documentación de referencia: [asistente de despliegue](https://developers.cloudflare.com/workers/platform/deploy-buttons/), [migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/), [precios Workers](https://developers.cloudflare.com/workers/platform/pricing/) y [precios D1](https://developers.cloudflare.com/d1/platform/pricing/).

Autoría y dirección pedagógica: Sandra Mangas Hernández. Desarrollo con asistencia de inteligencia artificial.
