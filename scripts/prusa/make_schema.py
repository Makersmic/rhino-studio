#!/usr/bin/env python3
"""Make Studio's PrusaSlicer settings list from a PrusaSlicer release's own source.

    git clone --depth 1 --branch version_2.9.6 --filter=blob:none --sparse https://github.com/prusa3d/PrusaSlicer ps
    (cd ps && git sparse-checkout set --no-cone /src/libslic3r/PrintConfig.cpp /src/slic3r/GUI/Tab.cpp /version.inc)
    python3 scripts/prusa/make_schema.py ps 2.9.6 > src/slicer/prusa/schema.json

It reads two files, nothing else:
  src/libslic3r/PrintConfig.cpp  every option: type, label, tooltip, units, limits, choices, default, mode
  src/slic3r/GUI/Tab.cpp         how PrusaSlicer's Print, Filament and Printer tabs lay them out:
                                 pages, groups, and the order inside each group

so Prepare shows the same options, in the same places, at the same Simple / Advanced / Expert levels as
PrusaSlicer itself. Run it again for a new PrusaSlicer release. The Portal checks the result against the
installed engine (prusa-slicer --help-fff) and hides anything that engine doesn't know.

PrusaSlicer is AGPL-3.0 (Prusa Research and the Slic3r authors). The option names, labels and tooltips
come from it; Studio is GPL-3.0-or-later, which may be combined with AGPL-3.0 code (GPL-3.0 section 13).
"""
import json
import re
import sys

ROOT, VERSION = sys.argv[1], sys.argv[2]
pc = open(f"{ROOT}/src/libslic3r/PrintConfig.cpp", encoding="utf-8").read()
tab = open(f"{ROOT}/src/slic3r/GUI/Tab.cpp", encoding="utf-8").read()


# ---------------------------------------------------------------- C++ string literals
def cstr(s):
    """Join adjacent "..." "..." literals (inside L(...) / _u8L(...)) into one Python string."""
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', s)
    out = "".join(parts)
    return bytes(out, "utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8")


# ---------------------------------------------------------------- enum constant -> key, from the static maps
enum_maps = {}
for m in re.finditer(r"static (?:const )?t_config_enum_values s_keys_map_(\w+)\s*=?\s*\{(.*?)\};", pc, re.S):
    pairs = re.findall(r'\{\s*"([^"]+)"\s*,\s*(?:int\()?([\w:]+)\)?\s*\}', m.group(2))
    enum_maps[m.group(1)] = {const: key for key, const in pairs}


# ---------------------------------------------------------------- option definitions
TYPES = {
    "coFloat": "float", "coFloats": "floats", "coInt": "int", "coInts": "ints", "coBool": "bool", "coBools": "bools",
    "coString": "string", "coStrings": "strings", "coPercent": "percent", "coPercents": "percents",
    "coFloatOrPercent": "floatOrPercent", "coFloatsOrPercents": "floatsOrPercents", "coEnum": "enum", "coEnums": "enums",
    "coPoint": "point", "coPoints": "points", "coPoint3": "point3",
}
MODES = {"comSimple": "simple", "comAdvanced": "advanced", "comExpert": "expert"}


def default_value(expr, typ, enum_type):
    e = expr.strip()
    def num(x):
        x = x.strip().rstrip("f")
        if x.endswith("."):
            x = x[:-1]
        try:
            v = float(x)
            return str(int(v)) if v == int(v) and "e" not in x.lower() else repr(v).rstrip("0").rstrip(".") if "." in repr(v) else repr(v)
        except ValueError:
            return x
    if typ in ("bool",):
        return "1" if "true" in e else "0"
    if typ == "bools":
        return ",".join("1" if v == "true" else "0" for v in re.findall(r"\b(true|false)\b", e))
    if typ in ("int", "float"):
        m = re.search(r"\(\s*([-+0-9.eE]+f?)\s*\)", e)
        return num(m.group(1)) if m else None
    if typ in ("ints", "floats"):
        inner = re.search(r"\{(.*)\}", e, re.S)
        if not inner:
            m = re.search(r"\(\s*([-+0-9.eE]+)\s*\)", e)
            return num(m.group(1)) if m else ""
        return ",".join(num(v) for v in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", inner.group(1)))
    if typ == "percent":
        m = re.search(r"\(\s*([-+0-9.]+)\s*\)", e)
        return num(m.group(1)) + "%" if m else None
    if typ == "percents":
        inner = re.search(r"\{(.*)\}", e, re.S)
        return ",".join(num(v) + "%" for v in re.findall(r"[-+]?\d*\.?\d+", inner.group(1))) if inner else ""
    if typ == "floatOrPercent":
        m = re.search(r"[\(\{]\s*([-+0-9.]+)\s*,\s*(true|false)\s*[\)\}]", e)
        return (num(m.group(1)) + ("%" if m.group(2) == "true" else "")) if m else None
    if typ == "floatsOrPercents":
        vals = re.findall(r"FloatOrPercent\s*\{?\(?\s*([-+0-9.]+)\s*,\s*(true|false)", e)
        return ",".join(num(v) + ("%" if p == "true" else "") for v, p in vals)
    if typ == "string":
        m = re.search(r'ConfigOptionString\s*\(\s*(.*)\)\s*$', e, re.S)
        return cstr(m.group(1)) if m and '"' in m.group(1) else ""
    if typ == "strings":
        inner = re.search(r"\{(.*)\}", e, re.S)
        vals = re.findall(r'"((?:[^"\\]|\\.)*)"', inner.group(1)) if inner else []
        return ";".join(vals)
    if typ in ("enum", "enums"):
        consts = re.findall(r"\b([a-z][A-Za-z0-9]*[A-Z]\w*|\w+::\w+)\b", e.split(">", 1)[-1])
        mp = enum_maps.get(enum_type or "", {})
        keys = [mp.get(c, mp.get(c.split("::")[-1], None)) for c in consts]
        keys = [k for k in keys if k] or [c.split("::")[-1].lower() for c in consts]
        if keys:
            return keys[0] if typ == "enum" else ",".join(keys)
        return None
    if typ in ("point", "points"):
        pts = re.findall(r"Vec2d\s*\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)", e)
        return ",".join(f"{num(a)}x{num(b)}" for a, b in pts)
    return None


options = {}
blocks = re.split(r"\n\s*(?:auto \w+\s*=\s*)?def\s*=\s*this->add(?:_nullable)?\(", pc)
for b in blocks[1:]:
    m = re.match(r'"(\w+)"\s*,\s*(co\w+)\s*\);', b)
    if not m:
        continue
    key, cotype = m.group(1), m.group(2)
    typ = TYPES.get(cotype)
    if not typ:
        continue
    body = b[m.end():]
    body = re.split(r"\n\s*(?:(?:auto \w+\s*=\s*)?def\s*=\s*this->add|for \(|// -----|void \w+::|\}\s*\n\s*void)", body)[0]
    o = {"type": typ}
    def grab(field):
        mm = re.search(rf'def->{field}\s*=\s*L_CONTEXT\(\s*"((?:[^"\\]|\\.)*)"', body)
        if mm:
            return cstr('"' + mm.group(1) + '"')
        mm = re.search(rf"def->{field}\s*=\s*((?:L|_u8L|_L)?\s*\(?\s*(?:\"(?:[^\"\\]|\\.)*\"\s*)+\)?)\s*;", body, re.S)
        return cstr(mm.group(1)) if mm else None
    for f in ("label", "full_label", "category", "tooltip", "sidetext"):
        v = grab(f)
        if v:
            o[f] = v
    for f in ("min", "max"):
        mm = re.search(rf"def->{f}\s*=\s*([-+0-9.eE]+)\s*;", body)
        if mm:
            o[f] = float(mm.group(1))
    mm = re.search(r"def->mode\s*=\s*(com\w+)", body)
    o["mode"] = MODES.get(mm.group(1), "simple") if mm else "simple"
    if re.search(r"def->(gui_type|readonly)\s*=\s*(ConfigOptionDef::GUIType::password|true)", body):
        o["secret"] = True
    if "add_nullable" in b[:0] or "nullable" in m.group(0):
        o["nullable"] = True
    enum_type = None
    em = re.search(r"def->set_enum<(\w+)>\(\s*\{(.*?)\}\s*\)", body, re.S)
    if em:
        enum_type = em.group(1)
        o["enum"] = [{"value": v, "label": cstr(l)} for v, l in re.findall(r'\{\s*"([^"]+)"\s*,\s*((?:L|_u8L)\s*\(\s*(?:"(?:[^"\\]|\\.)*"\s*)+\)|"(?:[^"\\]|\\.)*")\s*\}', em.group(2))]
    else:
        em = re.search(r"def->set_enum_values\(\s*(?:ConfigOptionDef::GUIType::\w+\s*,\s*)?\{(.*?)\}\s*\)", body, re.S)
        if em:
            pairs = re.findall(r'\{\s*"([^"]*)"\s*,\s*((?:L|_u8L)?\s*\(\s*(?:"(?:[^"\\]|\\.)*"\s*)+\)|"[^"]*")\s*\}', em.group(1))
            if pairs:
                o["enum"] = [{"value": v, "label": cstr(l)} for v, l in pairs]
                o["open"] = True   # suggestions, any value allowed
            else:
                vals = re.findall(r'"([^"]*)"', em.group(1))
                if vals:
                    o["enum"] = [{"value": v, "label": v} for v in vals]
                    o["open"] = True
        em2 = re.search(r"def->set_enum<(\w+)>\(\s*\{(.*?)\}\s*,\s*\{(.*?)\}\s*\)", body, re.S)
        if em2:
            enum_type = em2.group(1)
            vals = re.findall(r'"([^"]+)"', em2.group(2))
            labs = [cstr(x) for x in re.findall(r'(?:L|_u8L)\s*\(\s*((?:"(?:[^"\\]|\\.)*"\s*)+)\)', em2.group(3))]
            o["enum"] = [{"value": v, "label": labs[i] if i < len(labs) else v} for i, v in enumerate(vals)]
    dm = re.search(r"set_default_value\(\s*new\s+(ConfigOption(\w+?)(?:<(\w+)>)?\s*(?:\(.*?\)|\{.*?\})\s*)\)\s*;", body, re.S)
    if dm:
        et = dm.group(3) or enum_type
        if dm.group(3):
            enum_type = dm.group(3)
        dv = default_value(dm.group(1), typ, et)
        if dv is not None:
            o["default"] = dv
    if typ in ("enum", "enums") and enum_type and "enum" not in o and enum_type in enum_maps:
        o["enum"] = [{"value": k, "label": k} for k in enum_maps[enum_type].values()]
    options[key] = o

# Options that reuse another option's choices: `def->enum_def = def_top_fill_pattern->enum_def;`
var_key = dict(re.findall(r'auto (\w+)\s*=\s*def\s*=\s*this->add(?:_nullable)?\(\s*"(\w+)"', pc))
for b in blocks[1:]:
    m = re.match(r'"(\w+)"', b)
    em = re.search(r"def->enum_def\s*=[^;]*?\b(def_\w+)->enum_def", b)
    if m and em and m.group(1) in options and var_key.get(em.group(1)) in options:
        src = options[var_key[em.group(1)]]
        if "enum" in src:
            options[m.group(1)]["enum"] = [dict(e) for e in src["enum"]]
            if src.get("open"):
                options[m.group(1)]["open"] = True

# Options PrusaSlicer copies from another definition in a loop (filament_* overrides of printer retraction)
for m in re.finditer(r"for \(const char \*opt_key : \{(.*?)\}\)\s*\{(.*?)\n    \}", pc, re.S):
    keys = re.findall(r'"(\w+)"', m.group(1))
    if 'std::string("filament_") + opt_key' in m.group(2) or '"filament_" + std::string(opt_key)' in m.group(2) or "filament_" in m.group(2):
        for k in keys:
            if k in options and f"filament_{k}" not in options:
                o = dict(options[k]); o["nullable"] = True; o["default"] = "nil"
                options[f"filament_{k}"] = o


# ---------------------------------------------------------------- tab layout
def layout(fn_names, page_rename=None):
    pages = []
    for fn in fn_names:
        mm = re.search(rf"\n\w+ {fn}\s*\(.*?\)\s*\n\{{(.*?)\n\}}\n", tab, re.S)
        if not mm:
            raise SystemExit(f"{fn} not found in Tab.cpp")
        page = group = None
        for line in mm.group(1).splitlines():
            p = re.search(r'add_options_page\(\s*(?:L\(\s*"([^"]+)"\s*\)|(\w+))', line)
            if p:
                name = p.group(1) or (page_rename or {}).get(p.group(2), p.group(2))
                page = {"label": name, "groups": []}
                pages.append(page)
                group = None
                continue
            g = re.search(r'new_optgroup\(\s*L\(\s*"([^"]+)"', line)
            if g and page is not None:
                group = {"label": g.group(1), "options": []}
                page["groups"].append(group)
                continue
            for k in re.findall(r'(?:append_single_option_line|get_option|create_line_with_near_label_widget\(\s*optgroup\s*,)\(?\s*"(\w+)"', line):
                if group is not None and k not in group["options"]:
                    group["options"].append(k)
    for p in pages:
        p["groups"] = [g for g in p["groups"] if g["options"]]
    return [p for p in pages if p["groups"]]


def overrides_page():
    """Filament Overrides is built in a loop over filament_overrides_option_keys."""
    mm = re.search(r"filament_overrides_option_keys\s*\{(.*?)\n\};", tab, re.S)
    groups = []
    for title, body in re.findall(r'\{\s*"([^"]+)"\s*,\s*\{(.*?)\}\s*\}', mm.group(1), re.S) if mm else []:
        groups.append({"label": title, "options": re.findall(r'"(\w+)"', body)})
    return [{"label": "Filament Overrides", "groups": groups}] if groups else []


tabs = [
    {"id": "print", "label": "Print Settings", "pages": layout(["TabPrint::build"])},
    {"id": "filament", "label": "Filament Settings", "pages": layout(["TabFilament::build"]) + overrides_page()},
    {"id": "printer", "label": "Printer Settings", "pages": layout(["TabPrinter::build_fff", "TabPrinter::build_extruder_pages", "TabPrinter::build_kinematics_page"],
                                                                   {"page_name": "Extruder"})},
]

# Some choice lists only carry their values; borrow the label another option gives the same value
labels = {}
for o in options.values():
    for e in o.get("enum", []):
        if e["label"] != e["value"]:
            labels.setdefault(e["value"], e["label"])
for o in options.values():
    for e in o.get("enum", []):
        if e["label"] == e["value"] and e["value"] in labels:
            e["label"] = labels[e["value"]]

used = {k for t in tabs for p in t["pages"] for g in p["groups"] for k in g["options"]}
missing = sorted(k for k in used if k not in options)
for t in tabs:
    for p in t["pages"]:
        for g in p["groups"]:
            g["options"] = [k for k in g["options"] if k in options]
out = {
    "engine": "PrusaSlicer",
    "version": VERSION,
    "source": f"github.com/prusa3d/PrusaSlicer tag version_{VERSION}: src/libslic3r/PrintConfig.cpp, src/slic3r/GUI/Tab.cpp (AGPL-3.0)",
    "tabs": tabs,
    "options": {k: options[k] for k in sorted(used) if k in options},
}
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
print(f"{len(out['options'])} options on {sum(len(t['pages']) for t in tabs)} pages; not resolved: {missing}", file=sys.stderr)
