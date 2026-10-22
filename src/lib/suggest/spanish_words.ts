// src/lib/suggest/spanish_words.ts
// Vocabulario base (español) ordenado de más a menos frecuente en diálogo
// cotidiano. Es solo el piso: el vocabulario que de verdad manda es el del
// propio guion (ver suggest.engine.ts), que se aprende solo mientras se
// escribe. Se puede ampliar a mano sin tocar nada más.

export const BASE_WORDS: string[] = `
de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras vosotros vosotras os mío mía míos mías tuyo tuya tuyos tuyas suyo suya suyos suyas nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos esas estoy estás está estamos estáis están esté estés estemos estéis estén estaré estarás estará estaremos estaréis estarán estaría estarías estaríamos estaríais estarían estaba estabas estábamos estabais estaban estuve estuviste estuvo estuvimos estuvisteis estuvieron
ser soy eres es somos sois son sea seas seamos seáis sean seré serás será seremos seréis serán sería serías seríamos seríais serían era eras éramos erais eran fui fuiste fue fuimos fuisteis fueron
tener tengo tienes tiene tenemos tenéis tienen tenga tengas tengamos tengáis tengan tendré tendrás tendrá tendremos tendréis tendrán tendría tenía tenías teníamos tenían tuve tuviste tuvo tuvimos tuvieron
haber he has ha hemos han había habías habíamos habían hubo habrá habría haya
hacer hago haces hace hacemos hacen haga hagas hagamos hagan haré harás hará haremos harán haría hacía hacían hice hiciste hizo hicimos hicieron hecho
ir voy vas va vamos vais van vaya vayas vayamos vayan iré irás irá iremos irán iría iba ibas íbamos iban fui fuiste fue
poder puedo puedes puede podemos podéis pueden pueda puedas podamos puedan podré podrás podrá podremos podrán podría podrías podríamos podrían podía podías podían pude pudiste pudo pudimos pudieron
querer quiero quieres quiere queremos queréis quieren quiera quieras queramos quieran querré querrá querría querrías quería querías queríamos querían quise quiso quisieron
decir digo dices dice decimos dicen diga digas digamos digan diré dirás dirá diría decía decías decían dije dijiste dijo dijimos dijeron dicho
saber sé sabes sabe sabemos sabéis saben sepa sepas sepamos sepan sabré sabrás sabrá sabría sabía sabías sabían supe supo supieron
ver veo ves ve vemos ven vea veas veamos vean veré verás verá vería veía veías veían vi viste vio vimos vieron visto
dar doy das da damos dan dé des demos den daré darás dará daría daba dabas daban di diste dio dimos dieron
venir vengo vienes viene venimos vienen venga vengas vengamos vengan vendré vendrá vendría venía venías venían vine viniste vino vinimos vinieron
salir salgo sales sale salimos salen salga salgas salgan saldré saldrá saldría salía salían salí saliste salió salieron
pensar pienso piensas piensa pensamos piensan piense pensaré pensará pensaría pensaba pensabas pensaban pensé pensaste pensó pensaron
creer creo crees cree creemos creen crea creía creían creí creyó creyeron
sentir siento sientes siente sentimos sienten sienta sentía sentían sentí sintió
parecer parece parecen parecía parecían pareció
quedar quedo quedas queda quedamos quedan quedaba quedó quedaron
dejar dejo dejas deja dejamos dejan deje dejaba dejé dejó dejaron
llevar llevo llevas lleva llevamos llevan lleve llevaba llevé llevó llevaron
seguir sigo sigues sigue seguimos siguen siga seguía siguió siguieron
encontrar encuentro encuentras encuentra encontramos encuentran encontré encontró encontraron
llamar llamo llamas llama llamamos llaman llamó llamaron
volver vuelvo vuelves vuelve volvemos vuelven vuelva volvía volví volvió volvieron
tomar tomo tomas toma tomamos toman tomó tomaron
conocer conozco conoces conoce conocemos conocen conocía conocí conoció
vivir vivo vives vive vivimos viven vivía viví vivió
morir muero mueres muere morimos mueren murió murieron muerto muerte
esperar espero esperas espera esperamos esperan esperaba esperé esperó
buscar busco buscas busca buscamos buscan buscaba busqué buscó
entrar entro entras entra entramos entran entré entró
hablar hablo hablas habla hablamos hablan hablaba hablé habló hablaron
trabajar trabajo trabajas trabaja trabajamos trabajan trabajaba trabajó
escribir escribo escribes escribe escribimos escriben escribía escribí escribió
perder pierdo pierdes pierde perdemos pierden pierda perdí perdió perdieron
producir recibir recibo recibe recibí recibió
ayudar ayudo ayudas ayuda ayudamos ayudan ayude ayudé ayudó ayudaron
necesitar necesito necesitas necesita necesitamos necesitan necesitaba necesité necesitó
recordar recuerdo recuerdas recuerda recordamos recuerdan recordaba recordé recordó
mirar miro miras mira miramos miran mire miraba miré miró miraron
oír oigo oyes oye oímos oyen oía oí oyó
escuchar escucho escuchas escucha escuchamos escuchan escuchaba escuché escuchó
abrir abro abres abre abrimos abren abrió abrieron abierto
cerrar cierro cierras cierra cerramos cierran cerró cerraron cerrado
correr corro corres corre corremos corren corría corrí corrió
caminar camino caminas camina caminamos caminan caminaba caminó
sonreír sonrío sonríes sonríe sonrió sonrisa
llorar lloro lloras llora lloramos lloran lloraba lloró lágrimas
gritar grito gritas grita gritan gritó gritaron
amar amo amas ama amamos aman amaba amó amor
odiar odio odias odia odiaba
mentir miento mientes miente mintió mentira mentiras
prometer prometo prometes promete prometí prometió promesa
gustar gusta gustan gustaba gustó
importar importa importan importaba importó
pasar paso pasas pasa pasamos pasan pase pasaba pasó pasaron
mundo vida tiempo día días noche noches año años vez veces cosa cosas hombre hombres mujer mujeres niño niña niños niñas gente persona personas amigo amiga amigos amigas familia padre madre padres hermano hermana hermanos hermanas hijo hija hijos hijas casa casas ciudad calle camino lugar lugares país
mano manos ojos ojo cara cabeza corazón cuerpo voz palabra palabras historia historias nombre nombres momento momentos parte forma manera razón verdad mentira idea ideas problema problemas pregunta preguntas respuesta respuestas trabajo escuela clase colegio profesor profesora maestro maestra compañero compañera
puerta ventana habitación cuarto sala cocina baño mesa silla cama luz sombra oscuridad silencio ruido música sonido
bueno buena buenos buenas malo mala malos malas mejor peor grande grandes pequeño pequeña pequeños pequeñas nuevo nueva nuevos nuevas viejo vieja viejos viejas primero primera primeros primeras último última últimos últimas solo sola solos solas mismo misma mismos mismas propio propia propios propias diferente diferentes importante importantes posible imposible necesario seguro segura cierto cierta largo larga corto corta alto alta bajo baja joven jóvenes feliz felices triste tristes
aquí allí allá ahí acá ahora luego después antes siempre nunca jamás todavía aún ya entonces mientras apenas casi demasiado bastante mucho muy poco tan tanto así bien mal mejor peor quizá quizás tal vez además incluso sino aunque pues sin embargo mientras tanto por favor gracias perdón lo siento hola adiós chao hasta luego buenos días buenas tardes buenas noches
qué quién quiénes cuál cuáles cómo cuándo dónde cuánto cuánta cuántos cuántas por qué para qué
sí no claro obvio tranquilo tranquila vamos oye mira espera para dime ven anda cállate basta listo lista ojalá obvio bacán cachai weón po
dentro fuera arriba abajo cerca lejos delante detrás encima debajo alrededor junto frente hacia según mediante tras
uno dos tres cuatro cinco seis siete ocho nueve diez cien mil primero segundo tercero
miedo dolor ira rabia alegría tristeza esperanza sueño sueños recuerdo recuerdos secreto secretos
pensamiento pensamientos mirada miradas silencio escena escenas capítulo capítulos final principio comienzo
nunca nadie nada alguien algo algún alguna ningún ninguna ninguno cada cualquier cualquiera varios varias ambos ambas
sentado sentada parado parada cansado cansada nervioso nerviosa sorprendido sorprendida confundido confundida enojado enojada
suspira suspiró suspiro sonríe asiente asintió niega negó voltea volteó levanta levantó baja bajó
`.split(/\s+/).filter(Boolean);
