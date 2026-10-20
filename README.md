# Arabic word data

`ar-fusha.txt` is a compact UTF-8 seed list for this game, not a comprehensive dictionary. Before `# VERBS`, whitespace-separated forms are lookup entries. After `# VERBS`, each row is `past|present-3ms|imperative` and is used only for conservative form generation. See the root README for coverage limitations and potential external resources.

The current file does not contain imported AyaSpell or Arramooz lexicon data. Its explicit word list and verb rows were assembled as a small project-specific seed; the validator intentionally treats missing entries as **unknown**, not automatically invalid.
