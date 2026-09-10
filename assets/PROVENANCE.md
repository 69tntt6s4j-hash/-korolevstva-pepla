# Графические ресурсы нового renderer

Созданы встроенным инструментом `image_gen` Codex. CLI/API-обход не использовался. PNG скопированы в проект; исходные результаты генерации сохранены отдельно. Рисование кадра атласа выполняется в Canvas без изменения исходного PNG. Прозрачность спрайтов — настоящий alpha-канал.

| Файл | Назначение | Генерация |
|---|---|---|
| `world-sprites.png` | 4×4 атлас объектов/декора | exec-4ee9fd88-3b01-4e84-9901-a7ecdfb58f91.png |
| `actors-v2.png` | 12 самостоятельных актёров; явные source frames | exec-b65af50a-d159-4dd4-a87e-f24734b46958.png |
| `terrain-materials.png` | 3×3 атлас материалов, без интерактивных объектов | exec-05f380f9-d96f-4740-81e4-2c00d84edfe9.png |

Первый вариант атласа актёров отвергнут из-за пересечения соседних силуэтов. В поставке используется только исправленный `actors-v2.png`. Границы кадров зафиксированы в `actorFrames` и проверяются тестом R38.

## Нормализованные спецификации production-набора

### World sprites

Transparent RGBA fantasy strategy sprite atlas, exactly four columns and four rows, isometric three-quarter view, detailed painted stone/wood/metal, cool blue and aged gold player faction, dark green necropolis, consistent upper-left lighting. No text, labels, interface or baked landscape. Row 1: blue-banner castle, sawmill, mine, village. Row 2: green-lit necropolis, ruined tower, blue altar, cave crag. Row 3: treasure chest, blue portal, pine-tree cluster, rock spires. Row 4: violet shrine, wooden watchtower, red military camp, sword-and-shield artifact. Distinct isolated full silhouettes suitable for scene compositing.

### Terrain materials

Square seamless fantasy game terrain material atlas in a 3×3 grid, top-down natural materials, no buildings, characters, objects, labels or interface. Row 1: green grass, dark slate, gravel road. Row 2: flowing blue water, glowing lava, cobblestones. Row 3: dry grass, cave gravel, wooden planks. Materials must support repeat/clip in an isometric Canvas renderer.

### Actors v2 — final prompt

Use case: stylized-concept. Production game sprite atlas for dark medieval fantasy strategy. Generate a transparent RGBA square image with EXACTLY 4 columns and 3 rows of twelve separated full-body actor sprites. Critical technical constraint: equal 4x3 invisible grid, each sprite must fit ENTIRELY WITHIN the CENTRAL 65% of its own cell with transparent padding on ALL FOUR sides. No weapon, wing, banner, feet or shadow may touch or cross its cell edges. Make sprites smaller to guarantee separation. Consistent isometric three-quarter viewing angle from above, realistic painted steel and richly textured fabric, cool blue and aged gold player faction, sinister undead enemy faction, soft upper-left lighting. Transparent background, no gridlines, no labels, no text, no contact sheet decoration, no backdrop. Row 1 from left: brown-haired male knight in blue gold armor on a brown horse with small blue banner; auburn-haired female mage in blue and gold cloak with sapphire staff; blue-gold armored pikeman with compact spear; green-cloaked human bowman with bow. Row 2 from left: blue-gold mounted cavalry lancer with compact lance; golden griffin with wings partly folded so entire silhouette fits its cell; blue-robed elderly wizard with crystal staff; skeleton warrior with rusted sword and round shield. Row 3 from left: hooded green-black necromancer with green orb staff; bulky green orc with axe; large gray wolf; black-armored undead rider on black horse with small red banner. Each character centered horizontally at 12.5%,37.5%,62.5%,87.5% of sheet width, each row centered vertically at16.67%,50%,83.33%. Full body visible with CLEAR generous empty transparent space around each. This is an actual sprite asset, not a screenshot.

Исходные портреты и изображение меню города взяты из 9.1.2 без изменения пикселей. Старые фоновые карты, маски и DOM-карточки не участвуют в новом production renderer.
