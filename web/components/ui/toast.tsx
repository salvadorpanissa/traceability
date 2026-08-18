"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const toastManager = ToastPrimitive.createToastManager()

function toast(options: Parameters<typeof toastManager.add>[0]) {
  return toastManager.add({ timeout: 5000, ...options })
}

function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 flex w-full max-w-[calc(100%-2rem)] flex-col gap-2 p-4 sm:max-w-sm">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((t) => (
    <ToastPrimitive.Root
      key={t.id}
      toast={t}
      className={cn(
        "relative flex items-start gap-2 rounded-xl border p-3 pr-8 text-sm shadow-lg transition-all",
        "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
        "data-[type=success]:border-[#89c96a] data-[type=success]:bg-[#89c96a]/15 data-[type=success]:text-[#3e6b28] dark:data-[type=success]:bg-[#89c96a]/10 dark:data-[type=success]:text-[#a9d98f]",
        "data-[type=error]:border-[#900a08] data-[type=error]:bg-[#900a08]/10 data-[type=error]:text-[#900a08] dark:data-[type=error]:bg-[#900a08]/15 dark:data-[type=error]:text-[#e0645f]",
        "data-starting-style:translate-y-1 data-starting-style:opacity-0 data-ending-style:opacity-0"
      )}
    >
      <div className="flex flex-col gap-0.5">
        {t.title ? <ToastPrimitive.Title className="font-medium" /> : null}
        {t.description ? (
          <ToastPrimitive.Description className="opacity-80" />
        ) : null}
      </div>
      <ToastPrimitive.Close
        className="absolute top-2 right-2 opacity-70 hover:opacity-100"
        aria-label="Close"
      >
        <XIcon className="size-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ))
}

export { Toaster, toast }
