# Mini CAD de cockpits: alcance y etapas

## Objetivo

Diseñar un cockpit compacto de simracing y vuelo mediante piezas editables: perfiles, conectores, placas y periféricos de dimensiones propias. El modelo debe permitir visualizar el montaje, revisar interferencias y producir un despiece trazable y planos acotados.

La habitación, el escritorio, el monitor y la postura del configurador actual aportan contexto espacial. El CAD añadirá precisión en el conjunto de piezas; las comprobaciones geométricas no certifican cargas, rigidez ni seguridad estructural.

## Primera versión

- Perfiles rectos con sección, serie/proveedor, longitud, posición y orientación.
- Uniones explícitas y compatibles con la serie de perfil, registrando escuadras, tuercas y tornillos.
- Periféricos genéricos configurables: base de volante, aro, pedales de coche y vuelo, cambio, freno de mano, HOTAS, asiento y raíles.
- Envolventes y patrones de anclaje independientes, con origen de montaje, diámetro y posición de cada taladro.
- Placas planas rectangulares y poligonales sencillas, espesor, agujeros pasantes y ranuras de ajuste.
- Editor 2D de placa con cotas y representación 3D del mismo modelo.
- Selección, mover/girar, duplicar, agrupar, ajuste a caras/referencias, deshacer/rehacer y entrada numérica.
- Proyecto guardable con versión; lista de piezas/cortes y exportación 2D de placas en DXF/SVG.
- Información textual de medidas verificadas, medidas supuestas y comprobaciones pendientes.

Piezas dobladas, mecanizados complejos, roscas modeladas, cálculo estructural y un catálogo exhaustivo de marcas se abordarán después. La primera versión no depende de disponer de modelos visuales detallados de todos los dispositivos.

## Modelo de datos

Todas las dimensiones CAD se almacenarán en mm. Cada pieza tendrá un identificador estable y una transformación local. Las referencias de montaje se expresarán respecto a la pieza que las contiene y conservarán su identidad al mover el conjunto.

Entidades propuestas:

| Entidad | Datos principales |
| --- | --- |
| Proyecto | Versión, unidades, piezas, uniones, grupos y modos |
| Tipo de perfil | Proveedor, serie, sección, caras, ranuras y referencias |
| Perfil colocado | Tipo, longitud, transformación y mecanizados |
| Periférico | Envolvente visual, recorrido, patrón de montaje y fuente de medidas |
| Placa | Contorno 2D, espesor, agujeros, ranuras y transformación |
| Unión | Piezas/referencias conectadas y componentes de fijación concretos |
| Grupo/modo | Ensamblaje, posición de uso, retirada o almacenamiento |

El modelo de dominio será la fuente de las cotas, exportaciones y cantidades. La escena 3D será una representación del modelo. El guardado antiguo se migrará mediante un adaptador, conservando la importación del configurador.

La elección de TypeScript, bibliotecas de interfaz y geometría se hará en una etapa técnica separada. Three.js puede seguir representando la escena. Una biblioteca 2D puede generar planos de placas; un núcleo CAD completo para STEP se evaluará cuando haga falta esa interoperabilidad.

## Etapas y criterios de aceptación

### 0. Base reproducible

Código actual en GitHub, comandos de desarrollo y comprobación documentados, pruebas existentes pasando y configuraciones personales fuera del repositorio. Estado de esta importación.

### 1. Modelo de piezas y montaje de referencia

Crear dos perfiles, una placa y un periférico genérico con medidas editables. Mover el conjunto conserva sus relaciones. Guardar y abrir no cambia las cotas. Deshacer/rehacer restaura los mismos identificadores y valores.

Caso de referencia: placa de 200 × 150 × 5 mm con cuatro agujeros de diámetro 6,5 mm en los puntos (−60, −40), (60, −40), (60, 40) y (−60, 40), respecto a su centro. El patrón del periférico debe coincidir con esos puntos al montarlo. Estas medidas son un caso de prueba, no un patrón de un fabricante.

### 2. Editor de perfilería

Colocar, duplicar, orientar y acotar perfiles. Ajustar extremos y caras sin solapes involuntarios. Las longitudes del despiece coinciden con las piezas, incluidas las diferencias entre ancho exterior y hueco entre largueros.

### 3. Placas y taladros

Editar el contorno, agujeros, matrices y ranuras desde una vista 2D. Validar elementos fuera del contorno, solapes y distancias mínimas configuradas según el proceso de fabricación. Los DXF/SVG deben reconstruir las mismas medidas al reabrirlos, sin cortes duplicados. El espesor y las notas de fabricación acompañan el plano; el DXF 2D no los codifica por sí solo.

### 4. Uniones y despiece

Registrar conectores y tornillería por unión real. Comprobar compatibilidad de ranura/serie, alineación y espacio para montar la fijación. El resumen identifica la procedencia de cada cantidad y marca las uniones aún sin resolver. La longitud de rosca y resistencia requieren datos de los componentes, no reglas visuales.

### 5. Cambio entre racing y vuelo

Modelar placas intercambiables, volante, joystick lateral o central, gases y cambio/freno de mano. Guardar posiciones de uso y almacenamiento y comprobar sus recorridos. Un elemento oculto en un modo sigue existiendo en el inventario físico del proyecto.

### 6. Integración y catálogos

Reintegrar habitación, escritorio, silla, brazo y postura; preservar diseños existentes. Añadir fichas verificadas de dispositivos y, cuando proceda, importar representaciones visuales o geometría CAD de fabricantes. Distinguir las referencias medidas de las aproximaciones.

## Validación

Comprobar transformaciones y unidades con casos conocidos; cotas y cantidades al modificar piezas; estabilidad de referencias; migración y guardado; deshacer/rehacer; alineación de taladros y exportaciones. Revisar en navegador los flujos completos y documentar las limitaciones de cada detector de colisiones o regla de montaje.
