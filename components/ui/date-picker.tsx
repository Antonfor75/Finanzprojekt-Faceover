'use client'

import * as React from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/utils/tw-merge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePicker({
  date,
  setDate,
  placeholder = "Datum wählen",
  className,
}: {
  date: string
  setDate: (date: string) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const parsedDate = date ? new Date(date) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(parsedDate!, "PPP", { locale: de }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsedDate}
          onSelect={(d) => {
            if (d) {
              setDate(format(d, "yyyy-MM-dd"))
            } else {
              setDate("")
            }
            setOpen(false)
          }}
          initialFocus
          locale={de}
        />
      </PopoverContent>
    </Popover>
  )
}
