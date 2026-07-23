"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import { runNaturalLanguageQuery, type QueryResult } from "@/app/(protected)/dashboard/query-actions";
import { QueryResultTable } from "@/components/dashboard/query-result-table";

const ERROR_MESSAGE_KEYS: Record<Extract<QueryResult, { status: "error" }>["messageKey"], TranslationKey> = {
  cantGenerate: "nlQuery.errorCantGenerate",
  timeout: "nlQuery.errorTimeout",
  connectionError: "nlQuery.errorConnection",
};

export function NaturalLanguageQuery({ locale }: { locale: Locale }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const response = await runNaturalLanguageQuery(question);
      setResult(response);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-20 w-full rounded-lg border p-2 text-sm"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={translate(locale, "nlQuery.placeholder")}
      />
      <div>
        <Button onClick={handleSubmit} disabled={isPending || question.trim().length === 0}>
          {isPending ? translate(locale, "nlQuery.submitPending") : translate(locale, "nlQuery.submit")}
        </Button>
      </div>
      {result?.status === "ok" && <QueryResultTable columns={result.columns} rows={result.rows} locale={locale} />}
      {result?.status === "error" && (
        <p className="text-destructive">{translate(locale, ERROR_MESSAGE_KEYS[result.messageKey])}</p>
      )}
    </div>
  );
}
