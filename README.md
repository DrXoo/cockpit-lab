# Cockpit Lab

Aplicación web para explorar un cockpit DIY compacto de perfiles de aluminio, alternar simracing y vuelo VR y comprobar su distribución junto al escritorio y dentro de una habitación.

Este repositorio recoge el configurador existente como punto de partida para un **mini CAD de perfilería, periféricos y placas personalizadas**. El editor CAD está planificado; todavía no está implementado.

## Ejecutar en tu PC

Requisitos: Git y Node.js 22.12 o posterior. Node.js 24 LTS es una opción adecuada. La versión actual incluye sus dependencias de navegador y no necesita instalar paquetes ni compilar.

```sh
git clone https://github.com/DrXoo/cockpit-lab.git
cd cockpit-lab
npm run dev
```

Abre <http://127.0.0.1:5173>. Para usar otro puerto: `npm run dev -- --port 5174`.

Para trabajar en VS Code, abre la carpeta clonada o ejecuta `code .` desde ella. El servidor permite recargar la página después de guardar los cambios; no incluye recarga automática.

## Verificar cambios

```sh
npm run check
npm test
```

Las comprobaciones revisan la sintaxis del código propio y las pruebas de geometría, ergonomía aproximada, brazo, escritorio, habitación, puertas, muebles, silla y servidor local. Los cambios en la interfaz también requieren una comprobación en el navegador.

## Qué incluye ahora

- Presets GT, vuelo, híbrido y espacio mínimo.
- Medidas y posiciones del asiento, volante, pedales y soportes laterales.
- Escritorio de tamaño regulable, PC, teclado, ratón y alfombrilla XL.
- Brazo de monitor genérico articulado y posiciones de trabajo, cockpit y VR.
- Habitación rectangular con puertas, ventanas, muebles y silla de PC.
- Vistas 3D, planta, mesa y perfil; distribución mediante arrastre.
- Comprobaciones geométricas orientativas, resumen y exportación JSON/CSV.

La documentación detallada está en [docs/configurador-actual.md](docs/configurador-actual.md).

## Estructura

| Ruta | Responsabilidad |
| --- | --- |
| `dist/index.html`, `dist/styles.css` | Interfaz y estilos |
| `dist/app.js` | Controles, estado y exportaciones |
| `dist/model.js`, `dist/geometry.js` | Geometría, postura y cálculos del configurador |
| `dist/room.js`, `dist/room-editor.js` | Modelo y edición de habitación y muebles |
| `dist/scene.js` | Representación con Three.js y alternativa SVG |
| `dist/vendor/` | Dependencias de navegador y licencia de Three.js |
| `tests/` | Pruebas automatizadas |
| `scripts/` | Servidor de desarrollo y comprobaciones |
| `docs/` | Desarrollo, alcance y plan del mini CAD |

`dist/` contiene actualmente el código fuente servido directamente. Se conserva esta estructura en la importación para facilitar la comparación con la aplicación original. Una futura separación entre `src/` y salida compilada se hará como un cambio independiente.

## Desarrollo del mini CAD

Lee [el plan por etapas](docs/mini-cad.md) y [la guía de desarrollo](docs/desarrollo.md). El primer hito es un montaje de dos perfiles, una placa y un periférico con dimensiones y agujeros propios, representado en 3D y exportado con las mismas cotas.

El modelo actual aproxima los periféricos y las placas; estima fijaciones y no define sus taladros. La lista de cortes actual es orientativa. Todavía no es un plano de fabricación validado ni un cálculo de resistencia.

## Configuraciones y alojamiento

Los diseños se guardan en el navegador bajo `cockpit-lab-v1` y se pueden exportar/importar en JSON. Cada origen (dominio y puerto) tiene su propio almacenamiento. Para llevar un diseño de la web alojada al entorno local, expórtalo allí e impórtalo aquí. Los archivos personales pueden guardarse en `configuraciones-personales/`, excluida de Git.

El repositorio es público. La publicación original en Sites mantiene su propio control de acceso y su proceso de despliegue. Un push a GitHub **no despliega** esa web. La etiqueta «Privado» de la interfaz describe el alojamiento original y no implementa autenticación en una copia servida por otro medio.

## Dependencias y licencia

Three.js y los componentes incluidos en `dist/vendor/` conservan su [licencia MIT](dist/vendor/LICENSE). No se añade una licencia al código propio en esta importación; la elección de licencia del proyecto queda pendiente.
