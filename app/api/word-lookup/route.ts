type DictionaryDefinition = {
  definition?: string;
  example?: string;
  synonyms?: string[];
};

type DictionaryMeaning = {
  partOfSpeech?: string;
  definitions?: DictionaryDefinition[];
};

type DictionaryEntry = {
  word?: string;
  meanings?: DictionaryMeaning[];
};

type LookupDetails = {
  word: string;
  meaning: string;
  explanation: string;
  example_sentence: string;
  note: string;
  warning: string;
};

const DICTIONARY_BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en";
const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const MYMEMORY_TRANSLATE_URL = "https://api.mymemory.translated.net/get";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "請輸入有效的單字。" }, { status: 400 });
  }

  const word = normalizeWord(
    typeof body === "object" && body && "word" in body ? (body as { word?: unknown }).word : "",
  );

  if (!word) {
    return Response.json({ error: "請先輸入英文單字。" }, { status: 400 });
  }

  if (word.length > 80) {
    return Response.json({ error: "單字太長，請輸入 80 個字元以內。" }, { status: 400 });
  }

  const entries = await fetchDictionaryEntries(word);
  const dictionaryDetails = extractDictionaryDetails(entries);
  const meaning = await translateWordToTraditionalChinese(word);

  const details: LookupDetails = {
    word,
    meaning,
    explanation: "",
    example_sentence: dictionaryDetails.example,
    note: "",
    warning: "",
  };

  if (!entries.length && !isUsefulTranslation(details.meaning, word)) {
    return Response.json({ error: "查不到這個單字，請確認拼字。" }, { status: 404 });
  }

  return Response.json(details);
}

function normalizeWord(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function fetchDictionaryEntries(word: string): Promise<DictionaryEntry[]> {
  try {
    const response = await fetch(`${DICTIONARY_BASE_URL}/${encodeURIComponent(word)}`, {
      cache: "no-store",
    });

    if (!response.ok) return [];

    const data = (await response.json()) as unknown;
    return Array.isArray(data) ? (data as DictionaryEntry[]) : [];
  } catch {
    return [];
  }
}

function extractDictionaryDetails(entries: DictionaryEntry[]) {
  const definitions = entries.flatMap((entry) =>
    (entry.meanings ?? []).flatMap((meaning) =>
      (meaning.definitions ?? [])
        .filter((definition) => definition.definition)
        .map((definition) => ({
          ...definition,
          partOfSpeech: meaning.partOfSpeech ?? "",
        })),
    ),
  );

  const bestDefinition = definitions.find((definition) => definition.example) ?? definitions[0];
  const example = definitions.find((definition) => definition.example)?.example ?? "";

  return {
    definition: bestDefinition?.definition ?? "",
    example,
  };
}

async function translateWordToTraditionalChinese(word: string) {
  const googleTranslation = await translateWithGoogle(word);
  if (googleTranslation) return googleTranslation;

  const myMemoryTranslation = await translateWithMyMemory(word);
  if (isUsefulTranslation(myMemoryTranslation, word)) return myMemoryTranslation;

  return "";
}

async function translateToTraditionalChinese(texts: string[]) {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY ?? process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  const filteredTexts = texts.map((text) => text.trim()).filter(Boolean);

  if (!apiKey || filteredTexts.length === 0) {
    return texts.map(() => "");
  }

  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`, {
      body: JSON.stringify({
        q: filteredTexts,
        source: "en",
        target: "zh-TW",
        format: "text",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return texts.map(() => "");
    }

    const data = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const translations = data.data?.translations ?? [];
    let index = 0;

    return texts.map((text) => {
      if (!text.trim()) return "";
      const translatedText = translations[index]?.translatedText ?? "";
      index += 1;
      return decodeHtmlEntities(translatedText);
    });
  } catch {
    return texts.map(() => "");
  }
}

async function translateWithGoogle(text: string) {
  const [translated] = await translateToTraditionalChinese([text]);
  return translated;
}

async function translateWithMyMemory(text: string) {
  try {
    const url = new URL(MYMEMORY_TRANSLATE_URL);
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", "en|zh-TW");

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) return "";

    const data = (await response.json()) as {
      responseData?: { translatedText?: string };
    };

    return decodeHtmlEntities(data.responseData?.translatedText ?? "").trim();
  } catch {
    return "";
  }
}

function isUsefulTranslation(value: string, source: string) {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedSource = source.trim().toLowerCase();
  return Boolean(normalizedValue && normalizedValue !== normalizedSource);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
