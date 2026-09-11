// Схемы ответа модели. СГЕНЕРИРОВАНО `cli.py schema --emit`.
// Руками не правится: источник — `schema/*.json`, здесь его копия.
//
// Проверяет их своя проверка (`schema.ts`), а не библиотека: схема
// использует десять ключевых слов и ни одного комбинатора (решение 124).

import type { Schema } from "./schema";

export const SIGN_SCHEMA: Schema = {
 "$schema": "https://json-schema.org/draft/2020-12/schema",
 "$id": "parkread/sign.schema.json",
 "title": "Извлечённая структура парковочного знака",
 "description": "Контракт между vision-моделью и детерминированным кодом. Модель заполняет ТОЛЬКО эти поля: закрытый список, additionalProperties запрещены везде. Всё, что модель хотела бы сказать помимо схемы, попадает в notes и в вычисления не входит.",
 "type": "object",
 "additionalProperties": false,
 "required": [
  "schema_version",
  "main_sign",
  "panels",
  "panel_count",
  "boundaries"
 ],
 "properties": {
  "schema_version": {
   "const": 1
  },
  "main_sign": {
   "description": "Верхняя панель стопки. НЕ входит в panels: на проверке модели она дублировала P первой табличкой, поэтому валидация обязана отбрасывать панель, всё содержимое которой — пиктограмма основного знака.",
   "type": "object",
   "additionalProperties": false,
   "required": [
    "type",
    "background_color",
    "form",
    "legibility"
   ],
   "properties": {
    "type": {
     "description": "wayfinding_* стоянки не разрешают вовсе — это указатели направления, и путать их с разрешающим знаком нельзя.",
     "enum": [
      "parking",
      "prohibition_parking",
      "prohibition_stopping",
      "wayfinding_parking_house",
      "wayfinding_park_and_ride",
      "unknown"
     ]
    },
    "background_color": {
     "$ref": "#/$defs/color"
    },
    "form": {
     "description": "zone — начало зоны (жёлтый квадрат с круглым знаком внутри). Правило читается так же, как у обычного знака; протяжённость зоны продукт не вычисляет.",
     "enum": [
      "regular",
      "zone",
      "unknown"
     ]
    },
    "legibility": {
     "$ref": "#/$defs/legibility"
    }
   }
  },
  "panels": {
   "description": "Панели НИЖЕ основного знака, строго в порядке сверху вниз. Порядок значим: от него зависит правило.",
   "type": "array",
   "items": {
    "$ref": "#/$defs/panel"
   }
  },
  "panel_count": {
   "description": "Число панелей ниже основного знака. Дублирует длину panels намеренно: расхождение — сигнал того, что модель потеряла границу, и его нельзя получить из самого списка.",
   "type": "integer",
   "minimum": 0
  },
  "boundaries": {
   "description": "Про границы между панелями. Модель СООБЩАЕТ здесь своё мнение, но код его не принимает на веру: на снимке 013 две таблички были слиты в одну при certain = true. Признак неопределённости собирается кодом из независимых сигналов.",
   "type": "object",
   "additionalProperties": false,
   "required": [
    "certain"
   ],
   "properties": {
    "certain": {
     "type": "boolean"
    },
    "doubt": {
     "description": "Между какими соседними панелями граница под вопросом. Индексы панелей.",
     "type": "array",
     "items": {
      "type": "integer",
      "minimum": 1
     }
    }
   }
  },
  "notes": {
   "description": "Свободный текст модели. В движок и в формулу уверенности НЕ входит: проза не проверяется кодом. Существует, чтобы модели было куда деть наблюдение, для которого нет поля, и чтобы такие наблюдения было видно при разборе ошибок.",
   "type": [
    "string",
    "null"
   ],
   "maxLength": 1000
  },
  "model_confidence": {
   "description": "Самооценка модели. Один из входов формулы уверенности этапа 4, и не решающий.",
   "type": [
    "number",
    "null"
   ],
   "minimum": 0,
   "maximum": 1
  }
 },
 "$defs": {
  "color": {
   "description": "Цвет фона — извлекаемое поле, а не оформление. Жёлтый в Швеции носят предупреждающие и запрещающие знаки, поэтому жёлтая панель означает запрет или ограничение; синяя и белая стоят под разрешающими.",
   "enum": [
    "blue",
    "yellow",
    "white",
    "green",
    "other",
    "unreadable"
   ]
  },
  "legibility": {
   "description": "Читаемость как поле схемы, а не как фраза в notes: формула уверенности этапа 4 работает с полями, а не с прозой.",
   "type": "object",
   "additionalProperties": false,
   "required": [
    "readable"
   ],
   "properties": {
    "readable": {
     "type": "boolean"
    },
    "obstructions": {
     "type": "array",
     "items": {
      "enum": [
       "sticker",
       "dirt",
       "snow",
       "glare",
       "shadow",
       "damage",
       "cropped",
       "blur",
       "distance",
       "angle"
      ]
     }
    }
   }
  },
  "panel": {
   "type": "object",
   "additionalProperties": false,
   "required": [
    "index",
    "kind",
    "lines",
    "background_color",
    "legibility",
    "parsed"
   ],
   "properties": {
    "index": {
     "description": "Порядковый номер сверху вниз, начиная с 1.",
     "type": "integer",
     "minimum": 1
    },
    "kind": {
     "description": "Что это за панель. `sign_plate` — табличка, задающая правило: только такие попадают в движок. `operator_plate` — табличка с названием оператора и телефоном: по форме законная дополнительная табличка, но правил не задаёт. `info_board` — платёжное табло с кодом зоны и рекламой приложений, дорожным знаком не является. Две последние помечаются, а не выбрасываются: на фотографии они видны, и молчаливый пропуск выглядит как потеря. В ответ пользователю они не попадают.",
     "enum": [
      "sign_plate",
      "operator_plate",
      "info_board"
     ]
    },
    "lines": {
     "description": "Дословный текст построчно, на шведском, со скобками и дефисами как на знаке. Пустой массив, если на панели только пиктограмма.",
     "type": "array",
     "items": {
      "type": "string"
     }
    },
    "background_color": {
     "$ref": "#/$defs/color"
    },
    "legibility": {
     "$ref": "#/$defs/legibility"
    },
    "parsed": {
     "$ref": "#/$defs/parsed"
    }
   }
  },
  "parsed": {
   "description": "Второй слой: то, что модель отнесла к известным категориям. Поля независимы и все необязательны — на одной панели их обычно одно-два. Смысл (ворота это, пометка или правило) присваивает КОД по справочнику, а не модель.",
   "type": "object",
   "additionalProperties": false,
   "properties": {
    "duration_limit": {
     "description": "Максимальная длительность подряд: `2 tim`, `30 min`.",
     "type": "object",
     "additionalProperties": false,
     "required": [
      "amount",
      "unit"
     ],
     "properties": {
      "amount": {
       "type": "number",
       "exclusiveMinimum": 0
      },
      "unit": {
       "enum": [
        "minutes",
        "hours"
       ]
      }
     }
    },
    "time_windows": {
     "description": "Окна на панели. Их может быть несколько с разными классами дня: `8-18` и `(8-15)` на одной табличке — это два окна.",
     "type": "array",
     "items": {
      "type": "object",
      "additionalProperties": false,
      "required": [
       "from",
       "to",
       "day_class"
      ],
      "properties": {
       "from": {
        "$ref": "#/$defs/clock"
       },
       "to": {
        "$ref": "#/$defs/clock"
       },
       "day_class": {
        "description": "unspecified — дни не указаны; all_days — явный токен `alla dagar`; weekday/eve/red — класс по оформлению числа; named_weekday — назван день недели. unspecified и all_days РАЗНЫЕ значения: на их различии стоит вычисление дополнения.",
        "enum": [
         "unspecified",
         "all_days",
         "weekday",
         "eve",
         "red",
         "named_weekday"
        ]
       },
       "named_weekday": {
        "description": "Заполняется только при day_class = named_weekday. Это ЛИТЕРАЛ: календарь праздников к нему не применяется — запрет `Tisdag 18-24` действует и в праздничный вторник.",
        "enum": [
         "monday",
         "tuesday",
         "wednesday",
         "thursday",
         "friday",
         "saturday",
         "sunday"
        ]
       },
       "week_parity": {
        "description": "Чётность номера недели ISO: `jämna veckor` — чётные, `udda veckor` — нечётные. Так в Швеции размечают уборку улиц: запрет действует не каждую неделю, а через одну. Без этого поля продукт считает запрет действующим ВСЕГДА и завышает строгость; хуже — на разрешающем окне он завысил бы разрешение.",
        "enum": [
         "even",
         "odd"
        ]
       },
       "dates": {
        "description": "Даты, ограничивающие окно. `mode: only` — окно действует ТОЛЬКО в этих промежутках; `mode: except` — действует всегда, КРОМЕ них. Промежуток задаётся днём и месяцем без года (`MM-DD`) и может перехлёстывать конец года: `11-01` … `05-15` — это зима. Один день записывается промежутком, у которого начало равно концу.\n\nТак на табличках и пишут: `Gäller ej 1 juli - 31 juli` — это `except` с промежутком в июль, `1 nov-15 maj` — это `only` с зимним промежутком, а `Gäller ej 15/6 15/8` — `except` с двумя промежутками по одному дню. Раньше здесь были номера целых месяцев, и середина месяца в них не выражалась вовсе.",
        "type": "object",
        "additionalProperties": false,
        "required": [
         "mode",
         "ranges"
        ],
        "properties": {
         "mode": {
          "enum": [
           "only",
           "except"
          ]
         },
         "ranges": {
          "type": "array",
          "minItems": 1,
          "items": {
           "type": "object",
           "additionalProperties": false,
           "required": [
            "from",
            "to"
           ],
           "properties": {
            "from": {
             "type": "string",
             "pattern": "^[01][0-9]-[0-3][0-9]$"
            },
            "to": {
             "type": "string",
             "pattern": "^[01][0-9]-[0-3][0-9]$"
            }
           }
          }
         }
        }
       }
      }
     }
    },
    "fee": {
     "description": "На панели заявлена плата (`Avgift`).",
     "type": "boolean"
    },
    "payment_method": {
     "description": "Что нужно **предъявить**, чтобы стоянка была законной: билет или парковочный диск. Это условие стоянки, а не способ оплаты. Канал оплаты (приложение, SMS, автомат) в область продукта не входит: на вопрос «можно ли здесь стоять и на каких условиях» он не отвечает.",
     "enum": [
      "ticket",
      "parking_disc"
     ]
    },
    "permit_required": {
     "description": "Нужно особое разрешение (`Särskilt P-tillstånd erfordras`).",
     "type": "boolean"
    },
    "scope_shift": {
     "description": "Токен сдвига охвата: `Övrig tid` и подобные. Означает, что дальнейшее относится к дополнению объявленного окна. Неопознанный токен сдвига — причина отказа: без него неизвестно, к какому времени относятся следующие строки.",
     "enum": [
      "remaining_time"
     ]
    },
    "eligibility": {
     "description": "Кому знак отводит места. Это ПОДПИСЬ к режиму, а не проверка: продукт не знает, кто перед знаком, и никогда не решает, относится ли к категории читатель.",
     "enum": [
      "residents",
      "visitors",
      "rented",
      "permit_holders",
      "disabled_permit",
      "custom"
     ]
    },
    "vehicle_class": {
     "description": "Появляется, только когда знак СУЖАЕТ круг. Отсутствие поля означает, что круг не сужен: одинокий P разрешает стоянку всем зарегистрированным моторным транспортным средствам, и подставлять сюда легковой автомобиль нельзя.",
     "enum": [
      "motorcycle",
      "car_only",
      "electric",
      "truck",
      "bus",
      "bicycle"
     ]
    },
    "arrow": {
     "description": "Стрелка протяжённости: на какой участок относительно знака распространяется указание над ней. Отдельной «граничной» семантики нет — стрелка вниз означает, что участок кончается у знака.",
     "enum": [
      "up",
      "down",
      "both_vertical",
      "left",
      "right",
      "both_horizontal"
     ]
    },
    "place_count": {
     "description": "Число мест (`2 platser`). Это количество, а не длительность: ближайший сосед по написанию — `2 tim`.",
     "type": "integer",
     "minimum": 1
    },
    "stretch_metres": {
     "description": "Отрезок, на котором действует знак (`0-25 m`).",
     "type": "object",
     "additionalProperties": false,
     "required": [
      "from",
      "to"
     ],
     "properties": {
      "from": {
       "type": "number",
       "minimum": 0
      },
      "to": {
       "type": "number",
       "minimum": 0
      }
     }
    },
    "placement": {
     "description": "Требование к постановке: только на размеченном месте, либо способ расстановки, показанный пиктограммой.",
     "enum": [
      "marked_bay_only",
      "as_shown"
     ]
    },
    "prohibition": {
     "description": "На панели символ запрета. Запрет в своём окне ПЕРЕКРЫВАЕТ разрешение, а не складывается с ним наравне.",
     "type": "boolean"
    },
    "pictogram": {
     "description": "Пиктограмма на панели, если она есть. Панель может нести указание вообще без текста.",
     "enum": [
      "parking",
      "wheelchair",
      "motorcycle",
      "car",
      "electric_car",
      "truck",
      "bus",
      "prohibition",
      "parking_disc",
      "arrow",
      "payment",
      "bicycle",
      "other"
     ]
    },
    "operator": {
     "description": "Информационная табличка оператора: название и телефон. Правил не задаёт, в движок не входит и уверенность не снижает.",
     "type": "object",
     "additionalProperties": false,
     "properties": {
      "name": {
       "type": "string"
      },
      "phone": {
       "type": "string"
      },
      "org_number": {
       "type": "string"
      }
     }
    },
    "tariff_code": {
     "description": "Номер тарифа (`Taxa 13`). Задаётся муниципалитетом, на разбор не влияет: показывается дословно и уверенность не снижает.",
     "type": "string"
    },
    "area_code": {
     "description": "Код зоны для оплаты через приложение (`Områdeskod 31370`).",
     "type": "string"
    },
    "uninterpreted": {
     "description": "Строки, которые модель прочитала, но ни к какой категории не отнесла. Показываются пользователю дословно и в вычисления не входят.",
     "type": "array",
     "items": {
      "type": "string"
     }
    },
    "permits_parking": {
     "description": "Табличка сама показывает знак стоянки (`P Avgift`, `P Förhyrda platser`) и тем самым восстанавливает разрешение в своём охвате. Нужна там, где основной знак запрещающий: снимок 019 — запрет 7-18, а «övrig tid» снова разрешает стоянку за плату. Без этого поля запрет распространялся бы и на дополнение.",
     "type": "boolean"
    }
   }
  },
  "clock": {
   "description": "Час в формате HH:MM, 24-часовой. Модель нормализует `7-17` и `07-17` одинаково.",
   "type": "string",
   "pattern": "^([01][0-9]|2[0-4]):[0-5][0-9]$"
  }
 }
};

export const TRIAGE_SCHEMA: Schema = {
 "$schema": "https://json-schema.org/draft/2020-12/schema",
 "$id": "parkread/triage.schema.json",
 "title": "Ответ стадии отсева",
 "description": "Стадия 0 конвейера. Один дешёвый вызов модели, отвечающий на единственный вопрос: парковочный ли это знак. Модель возвращает МЕТКУ, а не решение: продолжать конвейер или нет, решает код.",
 "type": "object",
 "additionalProperties": false,
 "required": [
  "category",
  "what_i_see",
  "panels_below_main_sign"
 ],
 "properties": {
  "schema_version": {
   "const": 1
  },
  "category": {
   "description": "Единственное поле, влияющее на ход конвейера. Порог смещён в сторону пропуска: сомнительное помечается parking_sign и уходит на разбор, потому что отсечь настоящий знак дороже, чем потратить лишний вызов на мусор.",
   "enum": [
    "parking_sign",
    "other_road_sign",
    "not_a_sign"
   ]
  },
  "what_i_see": {
   "description": "Одна короткая фраза о том, что на снимке. Нужна только для ответа пользователю, когда отсев остановил разбор. В вычисления не входит.",
   "type": "string",
   "maxLength": 200
  },
  "model_confidence": {
   "description": "Самооценка модели. Хранится ради замера на этапе 5 и НЕ является основанием ни для одного решения: на снимке 013 модель сообщила о полной уверенности, потеряв границу между табличками.",
   "type": [
    "number",
    "null"
   ],
   "minimum": 0,
   "maximum": 1
  },
  "panels_below_main_sign": {
   "description": "Сколько табличек ниже основного знака ЗАДАЮТ ПРАВИЛО — часы, длительность, плата, круг стоящих, стрелка, число мест. Таблички оператора и платёжные табло не считаются. Спрашивается здесь намеренно: это независимый взгляд на ту же фотографию, другой вызов и другой промпт. Раньше просили считать всё подряд — замер показал, что именно на «всём подряд» счёт и разваливается: табло это стопка наклеек без внятных границ, и число панелей на ней модель называет наугад. Теперь обе стороны считают одно и то же.",
   "type": [
    "integer",
    "null"
   ],
   "minimum": 0
  }
 }
};
