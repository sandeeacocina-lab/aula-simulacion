# Aula de simulación empresarial

Una oficina de prácticas para Formación Profesional: Agencia Tributaria, SEPE, Seguridad Social, banca y correo. Acceso libre desde el navegador, con una empresa ficticia configurable.

**Autoría y dirección pedagógica: Sandra Mangas. Desarrollo con asistencia de inteligencia artificial.**

Simulación educativa. No presenta documentos ante organismos públicos, no realiza movimientos de dinero ni envía correos reales. Los emblemas institucionales identifican la referencia didáctica; no implican afiliación ni respaldo oficial.

## Para docentes y alumnado

1. Entra en **Mi práctica** y configura los datos ficticios de la empresa.
2. Abre el módulo que necesites. Cada servicio funciona de forma independiente.
3. Revisa los datos importados antes de confirmar. Descarga los justificantes que te pida tu docente.
4. Al terminar, pulsa **Descargar copia de la práctica**. El archivo permite continuar en otro dispositivo mediante **Importar una práctica**.
5. Para un nuevo encargo, reinicia un módulo o todos los registros desde **Mi práctica**.

El profesorado puede preparar un supuesto, descargar su copia y compartirla con el grupo. Cada estudiante importa el mismo punto de partida y trabaja en su propio navegador.

### Servicios

| Módulo | Funciones |
| --- | --- |
| Agencia Tributaria | Modelos 303, 111, 115, 190, 347 y 349; borradores, validación didáctica, presentación, justificantes PDF y borrado. Importación del PDF educativo de NominaSOL para el 190. |
| SEPE | Comunicación inicial de contratos desde XML; revisión, observaciones sobre NIF y CCC, detección de duplicados, historial y PDF. Enlace al catálogo oficial de modelos. |
| Seguridad Social | Inscripción de empresas, afiliación y altas laborales; importación de RNT y RLC/DLC educativos, comprobación de coherencia, justificantes y borrado. |
| Banca Nexo | Cuenta, saldo inicial, transferencias, cobros, nóminas, efectivo, gastos y pagos manuales; mandatos, préstamos, leasing y cuotas; remesas SEPA XML y extractos CSV. Justificantes mediante imprimir/guardar PDF. |
| Correo | Recepción simulada, borradores, respuestas, firma personalizable, adjuntos, leído/no leído, archivo y papelera; exportación PDF y EML con adjuntos. |

Los pagos manuales de impuestos o cotizaciones en la banca sirven para practicar una operación bancaria: **no se vinculan a las declaraciones de los demás módulos**.

### Guardado y alcance

- Los datos y archivos se guardan en **este dispositivo y perfil de navegador**. Quien utilice ese mismo perfil verá la misma práctica. Otros dispositivos tendrán su propia práctica.
- No hace falta una cuenta de ChatGPT, de GitHub ni un registro de alumno para usar la web publicada.
- No hay base de datos remota, llamadas a inteligencia artificial ni almacenamiento de documentos en un servidor.
- El correo es un ejercicio local: no comunica ordenadores distintos y no envía a las direcciones indicadas.
- Los XML de contratos y remesas se procesan sin conservar el original. Se conservan los datos del registro y su referencia.
- Los PDF de cotización y los adjuntos del correo se guardan localmente hasta borrarlos. La copia completa incluye estos archivos.
- Borrar datos del navegador, usar una ventana privada o cambiar de equipo puede hacer que la práctica deje de estar disponible. Guarda tu copia descargada.
- Las copias admiten hasta 80 MB por archivo y 60 MB de adjuntos. La importación sustituye la práctica actual tras una confirmación. Solo se aceptan copias de esta aplicación, con estructura y adjuntos comprobados.
- La lectura de PDF admite la distribución de los documentos educativos de NominaSOL utilizada como referencia. Un PDF escaneado o un diseño diferente puede no reconocerse. No incorpora OCR ni validación administrativa oficial completa.
- El SEPE de prácticas admite la comunicación inicial de contratos; otros procedimientos de Contrat@ quedan fuera de esta versión.

## Publicación en GitHub Pages

El proyecto es una web estática. `docs/` contiene la versión lista para publicar, sin instalaciones por parte del alumnado.

1. Sube este proyecto a un repositorio público.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Elige la rama `main` y la carpeta `/docs`. Guarda.
4. GitHub mostrará la dirección pública cuando finalice la publicación.

No se necesitan claves, secretos de GitHub Actions, una API de pago ni servidores propios. GitHub Pages permite publicar repositorios públicos con GitHub Free, sujeto a sus límites de uso. Los visitantes descargan los archivos estáticos desde GitHub; las operaciones de simulación se ejecutan en su dispositivo.

- [Acerca de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Límites de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## Desarrollo y actualización

Requiere Node.js 22.13 o superior y npm. No hay variables de entorno, credenciales ni servicios externos que configurar.

```sh
npm ci
npm test
npm run build
npm run dev
```

Tras cambiar código, ejecuta las pruebas y la construcción y sube también la carpeta `docs/`. Las rutas usan fragmentos `#/...`, por lo que pueden abrirse y recargarse directamente en GitHub Pages. Los recursos tienen rutas relativas compatibles con el nombre del repositorio.

Los registros utilizan SQLite/WebAssembly mediante sql.js, persistido en IndexedDB. Cada petición se ejecuta de forma local y serializada; Web Locks coordina las pestañas en navegadores compatibles. Los archivos y registros se guardan en una única transacción de IndexedDB. Las declaraciones tributarias y preferencias usan claves propias de localStorage. Ningún reinicio borra datos de otras aplicaciones del mismo dominio.

La copia de prácticas exporta tablas y archivos, no código SQL ejecutable. Al restaurar se reconstruye una base nueva con el esquema conocido y se verifican columnas, tipos, referencias y adjuntos antes de sustituir la práctica.

Las pruebas cubren operaciones bancarias, concurrencia y saldos, contratos, registro laboral, extracción de PDF, correo y adjuntos, copias, aislamiento de módulos y recorridos de formularios.

## Componentes y referencias

React, Vite, Tailwind CSS, Radix UI, Lucide, sql.js, PDF.js y fast-xml-parser mantienen sus respectivas licencias. Las dependencias y versiones están en `package-lock.json`; sus avisos se conservan en los paquetes originales. Los iconos son Lucide (ISC). Las tipografías incrustadas se usan para permitir acentos en los justificantes.

Los enlaces a organismos públicos abren páginas externas. Sus modelos y procedimientos vigentes pueden cambiar; esta herramienta es una adaptación didáctica y debe utilizarse con las indicaciones del docente.
