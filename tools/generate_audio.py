"""
Pre-record every word, letter name and letter-team sound with OpenAI text-to-speech.

The key stays on your computer: the app only gets the finished .mp3 files in /audio.
Without these files the app uses the phone's built-in voice, which is fine for words
but can't say isolated sounds like /ʃ/ well.

    set OPENAI_API_KEY=sk-...        (Windows)   |   export OPENAI_API_KEY=sk-...   (Mac)
    py tools/generate_audio.py

Run it again after adding a topic: existing files are skipped. Costs a few cents.
"""
import json, os, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"
MODEL = "gpt-4o-mini-tts"
VOICE = "sage"
BASE = "Speak in a clear, warm British English accent, like a friendly primary-school phonics teacher talking to a 7-year-old. Slow and clear."

def slug(s):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))

def tts(text, instructions, path):
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=json.dumps({"model": MODEL, "voice": VOICE, "input": text, "instructions": instructions, "response_format": "mp3"}).encode(),
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        path.write_bytes(r.read())

def main():
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("Set OPENAI_API_KEY first.")
    OUT.mkdir(exist_ok=True)
    index = json.loads((ROOT / "topics" / "index.json").read_text(encoding="utf-8"))
    jobs = {}
    for p in index["packs"]:
        pack = json.loads((ROOT / "topics" / p["file"]).read_text(encoding="utf-8"))
        for tid, t in pack["teams"].items():
            words = [w["w"] for w in t.get("words", [])] + t.get("read", [])
            if t.get("key"): words.append(t["key"]["w"])
            for pair in t.get("magic", []): words += pair
            for w in words:
                jobs[f"word-{slug(w)}"] = (w, BASE + " Say just this one word.")
            if pack["kind"] == "alphabet":
                jobs[f"letter-{slug(t['name'])}"] = (f"{tid}.", BASE + f" Say only the NAME of the English letter {tid} (it sounds like '{t['name']}'), nothing else.")
            else:
                key = t.get("key", {}).get("w", "")
                jobs[f"sound-{slug(pack['id'] + ':' + tid)}"] = (
                    f"{t['sound']} ... {key}",
                    BASE + f" The text starts with IPA. Pronounce the isolated phonics sound {t['sound']} for the letters '{t.get('label', tid)}' "
                    f"(never spell the letter names) "
                    f"the way phonics teachers do: short and pure, with no extra 'uh' vowel after consonants. "
                    f"Then pause briefly and say the example word '{key}'.",
                )
    done = 0
    for name, (text, instr) in sorted(jobs.items()):
        path = OUT / f"{name}.mp3"
        if path.exists():
            continue
        try:
            tts(text, instr, path)
            done += 1
            print("ok ", name)
        except Exception as e:  # keep going; rerun later for the rest
            print("ERR", name, e)
    files = sorted(p.stem for p in OUT.glob("*.mp3"))
    (OUT / "manifest.json").write_text(json.dumps({"files": files}, indent=0), encoding="utf-8")
    print(f"new: {done}, total: {len(files)}. Bump VERSION in sw.js and upload the audio folder.")

if __name__ == "__main__":
    main()
