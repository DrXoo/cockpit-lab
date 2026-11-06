# Desarrollo y migración

## Punto de partida

La importación toma el código del configurador existente del commit `aebf0a0711f041078d41d9878c65c8fc7718e99f`. Los archivos de aplicación y sus tres suites de pruebas se copian sin cambios. El historial del repositorio público comienza con esta importación; no se publica el historial interno del alojamiento.

Se conserva `dist/vendor/LICENSE`. Se excluyen la identidad del Site, las credenciales, las capturas de comprobación internas y los JSON personales. El README original del configurador se conserva como `docs/configurador-actual.md`, con su alcance y limitaciones.

## Puesta en marcha

1. Clona el repositorio y abre la carpeta en VS Code.
2. Ejecuta `npm run dev` en la terminal integrada.
3. Abre la dirección indicada, normalmente `http://127.0.0.1:5173`.
4. Guarda los cambios y recarga la página.
5. Ejecuta `npm run check` y `npm test` antes de crear un commit.

No hace falta `npm install` para esta versión, que no añade dependencias de Node. El servidor solo escucha en la interfaz local y sirve el contenido de `dist/`.

## Flujo de trabajo

Mantén una versión funcional en `main`. Usa una rama para cada cambio importante, por ejemplo `feat/plate-editor` o `refactor/project-model`, y revisa el diff y la validación antes de integrarla. Describe en cada cambio el problema, el resultado y cómo se comprobó.

Las pruebas actuales verifican el modelo aproximado y sus regresiones. Las funciones de fabricación necesitan pruebas adicionales de unidades, referencias geométricas, agujeros, uniones y exportaciones. No conviertas un test del modelo aproximado en una afirmación de validez estructural.

## Publicación en Sites

La publicación existente y GitHub son destinos distintos. Esta importación no activa despliegues automáticos ni cambia el acceso del sitio alojado.

Para publicar cambios futuros, utiliza el flujo de Sites con la identidad existente del proyecto, conserva su audiencia y sincroniza el mismo código que se ha revisado en GitHub. La configuración de alojamiento se mantiene fuera del repositorio público (`.openai/` está ignorada). No hace falta crear otro Site para cada versión.

## Guardado de diseños

Los diseños locales y los de la web alojada no se sincronizan automáticamente. Exporta un JSON desde el origen que lo contiene e impórtalo en el otro. No borres el almacenamiento del navegador antes de exportar un diseño que quieras conservar.

Los futuros esquemas CAD incluirán versión y migración. Las unidades actuales son cm; introducir mm requiere una conversión explícita, comprobada mediante medidas conocidas y archivos anteriores.
