# Cockpit Lab

Configurador estático de cockpit DIY compacto, simracing y vuelo VR. Interfaz española, dimensiones en cm, despiece en mm. No requiere servicios externos ni CDN. El estado se guarda localmente en el navegador y se exporta en JSON/CSV o se imprime.

- `dist/model.js`: geometría, postura antropométrica, comprobaciones y despiece.
- `dist/scene.js`: modelo 3D con Three.js, OrbitControls y alternativa SVG sin WebGL.
- `dist/app.js`: ajustes, presets, persistencia y exportaciones.
- `dist/vendor/`: Three.js 0.186.1 y sus componentes, con licencia MIT.

Verificación: `node --test tests/model.test.mjs`.

Modelo de diseño aproximado: no valida cargas, rigidez, taladros, barrido completo del brazo ni acceso real. Comprobar medidas físicas antes de fabricar. Referencia E7 Pro: tablero 140 × 80 × 2,5 cm y estructura 63,5–128,5 cm; versión concreta por verificar. El brazo no corresponde a un producto comercial.

Distribución libre: posición X/Z y giro independientes de escritorio y cockpit; arrastre en planta, presets de distribución, zona fija y migración de configuraciones anteriores. Los alcances y las interferencias usan las transformaciones de ambos elementos; las intersecciones se comprueban con volúmenes orientados.

Escritorio: anclaje del brazo editable en cuatro bordes (mordaza) o interior (pasante), teclado y PC con posición/giro/tamaño, ratón independiente y alfombrilla XL de tamaño regulable. La vista Mesa permite arrastrarlos sobre el tablero; las posiciones son locales y se guardan con las configuraciones previas. Se comprueban límites del tablero, solapes de objetos y cobertura del ratón. El resumen incluye posición, huella y giro de cada accesorio.

Tablero regulable: ancho de 120 a 200 cm y fondo de 60 a 80 cm, con presets y medidas intermedias. Las cotas, huella, mordaza, límites de arrastre y resumen usan las dimensiones actuales. Al redimensionar se conservan los tamaños de los accesorios; los que caben se recolocan y los que sobresalen generan aviso. Los pies de referencia mantienen 66 cm de fondo, incluidos en la huella del suelo.

Brazo articulado: dos tramos de longitud fija (total y reparto editables), giro de base, flexión del codo y giro VESA. Los modos automáticos apuntan al cockpit o al escritorio y resuelven las dos ramas del codo; el modo manual conserva las articulaciones. En Distribuir, con el anclaje seleccionado, se arrastran los puntos CODO y VESA en planta. El extremo respeta el alcance máximo y el plegado mínimo. Botones directos llevan de nuevo el monitor al cockpit o a la mesa. Persistencia y resumen incluyen los ángulos y las longitudes. Los topes físicos y la elevación propia de brazos comerciales no se simulan.

Cambio y freno de mano: derecha del piloto por defecto, con selector explícito de lado. Al mirar hacia +Z, la derecha del piloto es −X. Geometría, huella, interferencias y separación con HOTAS usan la misma referencia; el resumen y JSON guardan la elección. HOTAS representa joystick a la derecha y gases a la izquierda del piloto.

Elevación del cockpit: **Cockpit → Base de aluminio → Elevación de la base** añade de 0 a 50 cm a todo el conjunto: chasis, asiento, piloto, volante, pedales y mandos. Conserva la postura y las distancias relativas; mesa, monitor y apoyos en el suelo mantienen su altura. Los controles de postura, las cotas de perfil y los resúmenes muestran alturas finales desde el suelo. El eje del perfil de base está a `10 + baseLift` cm; su cara inferior, a `6 + baseLift` cm.

El campo opcional `baseLift` se guarda en cm en el JSON actual; los archivos anteriores usan 0 cm. Las alturas individuales guardadas conservan su referencia original y la conversión a altura desde el suelo es explícita. La elevación se conserva al cambiar de preset. Cuatro prolongaciones de perfil 40 × 40 definidas en el modelo, sobre los apoyos originales, alimentan escena, envolventes y despiece; su longitud es la elevación. Las uniones de esas prolongaciones y su arriostramiento quedan por definir y sus fijaciones no se incluyen en las estimaciones actuales. No se valida la resistencia de una base elevada. Las interferencias con mesa y muebles se recalculan a la nueva altura, con la tolerancia existente de 0,1 cm: el contacto dentro de esa tolerancia no se considera interferencia.


## Habitación

La pestaña **Habitación** configura las medidas interiores de una habitación rectangular y su altura. Las paredes se nombran AB, BC, CD y DA en sentido horario desde la esquina superior izquierda de la planta. Cada puerta o ventana se coloca mediante su pared, distancia desde la esquina inicial y ancho.

- Puertas: ancho, altura, bisagra inicial/final, apertura interior/exterior y ángulo de 0–180°. La comprobación incluye el barrido desde cerrada hasta el ángulo configurado, discretizado en sectores de hasta 2°.
- Ventanas: ancho, altura, antepecho y reserva de acceso delante. No se simulan las hojas de ventana.
- Muebles: estantería, armario, cama, cajonera o volumen genérico; ancho, fondo, altura, posición y giro. Se pueden arrastrar en planta, igual que mesa y cockpit.
- Se detectan muebles fuera de los límites, superposición de muebles, interferencias con el conjunto y obstrucciones de la puerta. La reserva lateral comprueba una banda libre, no una ruta continua de acceso ni evacuación.
- Las posiciones del editor de habitación se muestran relativas a las paredes DA y AB; los datos se guardan en las coordenadas comunes de la aplicación. Cambiar el origen mueve las paredes y no los objetos. **Centrar mesa y cockpit** traslada ambos conservando su relación.

Los datos se guardan en el navegador y en los JSON exportados. Los archivos anteriores siguen siendo compatibles; al cargarlos se añade una habitación sin huecos ni muebles. El modelo es orientativo y no calcula esfuerzos, resistencia, detalles del herraje o colisiones precisas de piezas reales.

Verificación: `node --test tests/*.test.mjs` y prueba en navegador de creación, edición, arrastre, guardado y resumen.


### Silla de escritorio

**Habitación → ＋ Silla de PC** añade una silla con ruedas de 65 × 65 cm, altura total de 115 cm y asiento a 47 cm, inicialmente delante de la mesa y mirando hacia ella. Se puede arrastrar y girar independientemente; **Colocar frente al escritorio** vuelve a alinearla después de mover la mesa. Sus dimensiones se pueden ajustar a la silla real.

Las colisiones de la silla distinguen base, asiento, respaldo y reposabrazos para permitir posiciones parcialmente bajo el tablero cuando las alturas lo permiten. La franja trasera configurable reserva espacio para retirarla y se avisa si invade una pared u otro objeto. Es una reserva rectangular orientativa, no una simulación de movimiento de una persona. La silla y su reserva se incluyen en el JSON y en el resumen.
