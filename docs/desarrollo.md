# Desarrollo y migración

## Punto de partida

La importación toma el código del configurador existente del commit `aebf0a0711f041078d41d9878c65c8fc7718e99f`. Los archivos de aplicación y sus tres suites de pruebas se copian sin cambios. El historial del repositorio público comienza con esta importación; no se publica el historial interno del alojamiento.

Se conserva `dist/vendor/LICENSE`. Se excluyen la configuración del alojamiento original, las credenciales, las capturas de comprobación internas y los JSON personales. El README original del configurador se conserva como `docs/configurador-actual.md`, con su alcance y limitaciones.

## Puesta en marcha

1. Clona el repositorio y abre la carpeta en VS Code.
2. Ejecuta `npm run dev` en la terminal integrada.
3. Abre la dirección indicada, normalmente `http://127.0.0.1:5173`.
4. Guarda los cambios y recarga la página.
5. Ejecuta `npm run check` y `npm test` antes de crear un commit.

`npm run dev` no necesita `npm install`. Las comprobaciones sí: ejecuta `npm install` una vez para instalar Prettier, y `npm run format` para formatear el código. El servidor solo escucha en la interfaz local y sirve el contenido de `dist/`.

## Flujo de trabajo

Mantén una versión funcional en `main` y haz commits pequeños directamente en ella; usa una rama corta solo cuando un cambio necesite varios pasos antes de funcionar. Revisa el diff y la validación antes de cada commit. Describe en cada cambio el problema, el resultado y cómo se comprobó.

Las pruebas actuales verifican el modelo aproximado y sus regresiones. Las funciones de fabricación necesitan pruebas adicionales de unidades, referencias geométricas, agujeros, uniones y exportaciones. No conviertas un test del modelo aproximado en una afirmación de validez estructural.

## Despliegue

No hay despliegue externo. La aplicación se ejecuta en local y puede servirse con cualquier servidor de archivos estáticos.

## Guardado de diseños

Cada origen (host y puerto) tiene su propio almacenamiento. Para mover un diseño, expórtalo en JSON desde el origen que lo contiene e impórtalo en el otro. No borres el almacenamiento del navegador antes de exportar un diseño que quieras conservar.

Los futuros esquemas CAD incluirán versión y migración. Las unidades actuales son cm; introducir mm requiere una conversión explícita, comprobada mediante medidas conocidas y archivos anteriores.
