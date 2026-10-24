#!/usr/bin/env python3
"""
Genera public/words/es.txt (el diccionario base de sugerencias de palabras).

Combina dos fuentes abiertas:
  · Frecuencias reales en diálogo (FrequencyWords, OpenSubtitles 2018, CC BY-SA 4.0).
  · Un diccionario ortográfico (an-array-of-spanish-words, MIT) para quedarse
    solo con palabras que existen y descartar errores de tipeo de los subtítulos.

Cómo obtener los insumos (una sola vez):

  curl -O https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_full.txt
  npm i an-array-of-spanish-words an-array-of-english-words
  node -e "const f=require('fs');f.writeFileSync('es_dict.json',JSON.stringify(require('an-array-of-spanish-words')));f.writeFileSync('en_dict.json',JSON.stringify(require('an-array-of-english-words')))"

Uso:

  python3 scripts/build_spanish_words.py --freq es_full.txt --es-dict es_dict.json --en-dict en_dict.json

Ajustes útiles: --min-count (más alto = lista más corta y limpia),
--min-count-other (palabras que no están en el diccionario: nombres, jerga).
Las palabras propias se agregan a mano en public/words/es.custom.txt, no acá.
"""
import argparse, json, re, unicodedata

HEADER = """# Diccionario base de sugerencias de palabras (español).
#
# Formato: una palabra por línea, de la MÁS a la MENOS frecuente en diálogo
# (el orden define la prioridad: arriba = se sugiere antes).
# Las líneas que empiezan con # y las líneas vacías se ignoran.
# No hace falta ponerle mayúsculas ni quitarle tildes: el motor ya compara sin
# tildes y adapta la mayúscula a lo que se está escribiendo.
#
# Para agregar tus propias palabras NO edites este archivo (se puede regenerar):
# usa public/words/es.custom.txt.
#
# Fuentes y licencias:
#  · Frecuencias: FrequencyWords (hermitdave), basado en OpenSubtitles 2018,
#    licencia CC BY-SA 4.0 -> https://github.com/hermitdave/FrequencyWords
#  · Validación ortográfica: an-array-of-spanish-words (MIT).
# Generado con scripts/build_spanish_words.py
"""

WORD_RE = re.compile(r"^[a-záéíóúüñ]{2,30}$")
CLITIC_RE = re.compile(r"(?:lo|la|los|las|le|les|me|te|se|nos|os)$")
VOWELS = "aeiouáéíóúü"
STRONG = "aeoáéó"
# Monosílabos que sí llevan tilde (tilde diacrítica).
DIACRITIC_MONOSYLLABLES = {"él", "tú", "mí", "sí", "té", "dé", "sé", "más", "qué", "cuál", "quién", "cuán"}
# Palabras de varias sílabas con tilde diacrítica: la regla general no las explica.
DIACRITIC_WORDS = {
    "cómo", "dónde", "cuándo", "cuánto", "cuánta", "cuántos", "cuántas", "cuáles", "quiénes", "adónde",
    "éste", "ésta", "éstos", "éstas", "ése", "ésa", "ésos", "ésas",
    "aquél", "aquélla", "aquéllos", "aquéllas", "sólo",
}


def strip_accents(w):
    """Quita tildes pero conserva la ñ (así lo guarda el diccionario)."""
    w = w.replace("ñ", "\x01")
    w = "".join(c for c in unicodedata.normalize("NFD", w) if not unicodedata.combining(c))
    return w.replace("\x01", "ñ").lower()


def syllables(w):
    """Núcleos vocálicos de cada sílaba (aproximado; alcanza para ubicar la tilde)."""
    w = re.sub(r"qu(?=[eiéí])", "q", w)  # la u de que/qui no suena
    w = re.sub(r"gu(?=[eiéí])", "g", w)  # ni la de gue/gui (pero sí la de güe)
    nuclei, run = [], ""
    for ch in w:
        if ch in VOWELS:
            # Dos vocales fuertes, o una débil con tilde, forman hiato (sílabas separadas).
            if run and ((run[-1] in STRONG and ch in STRONG) or run[-1] in "íú" or ch in "íú"):
                nuclei.append(run)
                run = ""
            run += ch
        elif run:
            nuclei.append(run)
            run = ""
    if run:
        nuclei.append(run)
    return nuclei


def accent_ok(w):
    """¿La tilde está donde la ortografía española la pondría?"""
    marks = sum(1 for c in w if c in "áéíóú")
    if marks == 0:
        return True
    if marks > 1:
        return False
    nuc = syllables(w)
    n = len(nuc)
    if n == 0:
        return False
    if w in DIACRITIC_WORDS:
        return True
    if n == 1:
        return w in DIACRITIC_MONOSYLLABLES
    idx = next(i for i, s in enumerate(nuc) if any(c in "áéíóú" for c in s))
    stress_from_end = n - idx
    pos = next(i for i, c in enumerate(w) if c in "áéíóú")
    # í/ú junto a otra vocal rompen un hiato (día, país, baúl): tilde válida siempre.
    if w[pos] in "íú" and ((pos > 0 and w[pos - 1] in VOWELS) or (pos + 1 < len(w) and w[pos + 1] in VOWELS)):
        return True
    ends_light = w[-1] in VOWELS or w[-1] in "ns"
    if stress_from_end == 1:  # aguda: lleva tilde si termina en vocal, n o s
        return ends_light
    if stress_from_end == 2:  # llana: lleva tilde si NO termina en vocal, n o s
        return (not ends_light) or (w[-1] == "s" and w[-2] not in VOWELS)
    return True  # esdrújula / sobresdrújula: siempre


def clitic_stem_in_dict(w, dic):
    """hacerlo, déjame, dímelo...: verbo + pronombres cuyo verbo sí existe."""
    t = strip_accents(w)
    for _ in range(2):
        m = CLITIC_RE.search(t)
        if not m or len(t) - len(m.group()) < 2:
            break
        t = t[: m.start()]
        if t in dic or t + "r" in dic:
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--freq", required=True)
    ap.add_argument("--es-dict", required=True)
    ap.add_argument("--en-dict", required=True)
    ap.add_argument("--out", default="public/words/es.txt")
    ap.add_argument("--min-count", type=int, default=2, help="apariciones mínimas de palabras del diccionario")
    ap.add_argument("--min-count-clitic", type=int, default=5, help="idem para verbo+pronombre (hacerlo, dímelo)")
    ap.add_argument("--min-count-other", type=int, default=500, help="idem para palabras fuera del diccionario (nombres, jerga)")
    ap.add_argument("--variant-ratio", type=float, default=0.005, help="una variante con/sin tilde debe tener al menos esta fracción de la forma más usada")
    ap.add_argument("--unaccented-ratio", type=float, default=0.02, help="la forma sin tilde debe tener al menos esta fracción de la forma con tilde")
    args = ap.parse_args()

    dic = set(json.load(open(args.es_dict, encoding="utf-8")))
    en = set(json.load(open(args.en_dict, encoding="utf-8")))

    rows, seen = [], set()
    for line in open(args.freq, encoding="utf-8"):
        w, n = line.rstrip("\n").rsplit(" ", 1)
        if WORD_RE.match(w) and w not in seen:
            seen.add(w)
            rows.append((w, int(n)))

    # Frecuencia máxima por palabra sin tildes (para descartar variantes absurdas).
    top = {}
    for w, n in rows:
        k = strip_accents(w)
        top[k] = max(top.get(k, 0), n)

    # Frecuencia máxima entre las formas CON tilde de cada palabra: sirve para
    # descartar la versión sin tilde cuando casi nadie la escribe así
    # ("aprehension" vs "aprehensión").
    top_accented = {}
    for w, n in rows:
        if strip_accents(w) != w.replace("ü", "u") and accent_ok(w):
            k = strip_accents(w)
            top_accented[k] = max(top_accented.get(k, 0), n)

    kept = []
    for w, n in rows:
        if not accent_ok(w):
            continue
        if n < args.variant_ratio * top[strip_accents(w)]:
            continue
        has_mark = any(c in "áéíóú" for c in w)
        if not has_mark and n < args.unaccented_ratio * top_accented.get(strip_accents(w), 0):
            continue
        k = strip_accents(w)
        if k in dic:
            ok = n >= args.min_count
        elif clitic_stem_in_dict(w, dic):
            ok = n >= args.min_count_clitic
        else:
            # Fuera del diccionario: nombres, lugares, jerga. Se descartan las
            # palabras que son inglés (subtítulos con diálogo en inglés).
            ok = n >= args.min_count_other and w not in en
        if ok:
            kept.append((w, n))

    kept.sort(key=lambda x: -x[1])
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(HEADER + "\n".join(w for w, _ in kept) + "\n")
    print(f"{len(kept)} palabras -> {args.out}")


if __name__ == "__main__":
    main()
