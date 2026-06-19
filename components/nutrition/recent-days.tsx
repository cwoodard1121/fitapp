'use client'

import * as React from 'react'
import { parseISO, format } from 'date-fns'
import { Pencil, Trash2, NotebookPen } from 'lucide-react'

import type { NutritionLog } from '@/lib/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Badge,
} from '@/components/ui'

interface RecentDaysProps {
  logs: NutritionLog[]
  today: string
  pending: boolean
  onEdit: (log: NutritionLog) => void
  onDelete: (loggedOn: string) => void
}

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE, MMM d')
  } catch {
    return iso
  }
}

function num(n: number | null): string {
  return n === null || n === undefined ? '—' : String(Math.round(n))
}

export function RecentDays({
  logs,
  today,
  pending,
  onEdit,
  onDelete,
}: RecentDaysProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent days</CardTitle>
        <CardDescription>
          Your last logged days. Tap a row to edit or remove it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border bg-background/40 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-signal">
              <NotebookPen className="h-5 w-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Nothing logged yet
              </p>
              <p className="text-sm text-muted">
                Use the form above to log today&apos;s calories and macros. Your
                history shows up here.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">kcal</TableHead>
                <TableHead className="text-right">Protein</TableHead>
                <TableHead className="w-[88px] text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const isToday = log.logged_on === today
                return (
                  <TableRow key={log.id} className="h-12">
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {fmtDate(log.logged_on)}
                        {isToday ? (
                          <Badge variant="outline" className="text-[10px]">
                            today
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {num(log.calories)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted">
                      {num(log.protein)}
                      <span className="ml-0.5 text-[0.85em]">g</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`Edit ${log.logged_on}`}
                          disabled={pending}
                          onClick={() => onEdit(log)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted hover:text-gate-red"
                          aria-label={`Delete ${log.logged_on}`}
                          disabled={pending}
                          onClick={() => onDelete(log.logged_on)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
