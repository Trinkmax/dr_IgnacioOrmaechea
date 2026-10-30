"use client";

import { useMemo, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { CalendarClock, Search, UserPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { Avatar, Badge, Card, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { usePatients } from "@/lib/queries/patients";
import { useAppointmentsRange } from "@/lib/queries/agenda";
import { useBalances } from "@/lib/queries/money";
import { useDebounced } from "@/lib/hooks";
import { capitalize, money, relativeDay, time } from "@/lib/format";
import { cn, normalize } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/types";

type Filter = "todos" | "saldo" | "proximos";

export function PatientsView() {
  const { open } = useOverlay();
  const { data: patients = [], isLoading } = usePatients();
  const { data: balances = [] } = useBalances();
  const [from] = useState(() => startOfDay(new Date()));
  const { data: upcoming = [] } = useAppointmentsRange(from, addDays(from, 120));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [sort, setSort] = useState<"az" | "recientes">("az");
  const [limit, setLimit] = useState(150);
  const q = useDebounced(normalize(query), 120);

  const owed = useMemo(() => {
    const map = new Map<string, { ARS: number; USD: number }>();
    for (const b of balances) {
      if (!b.patient_id) continue;
      const entry = map.get(b.patient_id) ?? { ARS: 0, USD: 0 };
      entry[b.currency ?? "ARS"] += b.balance ?? 0;
      map.set(b.patient_id, entry);
    }
    return map;
  }, [balances]);

  const next = useMemo(() => {
    const map = new Map<string, CalendarAppointment>();
    for (const a of upcoming) {
      if (!a.patient_id || a.status === "cancelado" || new Date(a.ends_at) < new Date()) continue;
      if (!map.has(a.patient_id)) map.set(a.patient_id, a);
    }
    return map;
  }, [upcoming]);

  const list = useMemo(() => {
    const digits = query.replace(/\D/g, "");
    let result = patients.filter((p) => {
      if (filter === "saldo" && !owed.has(p.id)) return false;
      if (filter === "proximos" && !next.has(p.id)) return false;
      if (!q) return true;
      return (
        normalize(p.full_name).includes(q) ||
        (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) ||
        (p.dni ?? "").replace(/\D/g, "").includes(digits || "∅") ||
        normalize(p.email).includes(q)
      );
    });
    if (sort === "recientes") result = [...result].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return result;
  }, [patients, q, query, filter, sort, owed, next]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Pacientes"
        subtitle={isLoading ? "Cargando…" : `${patients.length} ${patients.length === 1 ? "paciente" : "pacientes"} en total`}
        actions={
          <Button onClick={() => open({ type: "patient-form", initialName: query.trim() || undefined })}>
            <UserPlus className="size-4" /> Nuevo paciente
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono, DNI o email"
            className={cn(controlClass, "h-11 pl-10 shadow-card")}
            aria-label="Buscar pacientes"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todos", label: "Todos" },
              { value: "proximos", label: "Con turno", count: next.size },
              { value: "saldo", label: "Con saldo", count: owed.size },
            ]}
          />
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: "az", label: "A–Z" },
              { value: "recientes", label: "Recientes" },
            ]}
          />
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_120px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted md:grid">
          <span>Paciente</span>
          <span>Próximo turno</span>
          <span>Saldo</span>
          <span className="text-right">Origen</span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          patients.length === 0 ? (
            <EmptyState
              icon={<UsersRound />}
              title="Todavía no hay pacientes"
              description="Cargalos acá o directamente al dar un turno: el paciente se crea en el momento."
              action={
                <Button onClick={() => open({ type: "patient-form" })}>
                  <UserPlus className="size-4" /> Cargar el primero
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Search />}
              title="Sin coincidencias"
              description={query ? `No encontramos “${query}”.` : "Ningún paciente cumple el filtro."}
              action={
                query ? (
                  <Button variant="secondary" onClick={() => open({ type: "patient-form", initialName: query.trim() })}>
                    <UserPlus className="size-4" /> Crear “{query.trim()}”
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <ul className="divide-y divide-line/70">
            {list.slice(0, limit).map((p) => {
              const appt = next.get(p.id);
              const debt = owed.get(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => open({ type: "patient", id: p.id })}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_120px] md:gap-4 md:px-5"
                  >
                    <span className="flex min-w-0 items-center gap-3 md:col-span-1">
                      <Avatar name={p.full_name} size={38} />
                      <span className="hidden min-w-0 md:block">
                        <span className="block truncate text-sm font-semibold text-ink">{p.full_name}</span>
                        <span className="block truncate text-xs text-muted">{p.phone || p.email || "Sin contacto"}</span>
                      </span>
                    </span>
                    <span className="min-w-0 md:hidden">
                      <span className="block truncate text-sm font-semibold text-ink">{p.full_name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {appt ? `${capitalize(relativeDay(appt.starts_at))} ${time(appt.starts_at)} · ${appt.treatment?.name ?? "Turno"}` : p.phone || "Sin turnos próximos"}
                      </span>
                    </span>
                    <span className="hidden min-w-0 text-sm md:block">
                      {appt ? (
                        <span className="flex items-center gap-2">
                          <CalendarClock className="size-4 shrink-0 text-muted" />
                          <span className="truncate">
                            <span className="font-medium capitalize text-ink">{relativeDay(appt.starts_at)}</span>{" "}
                            <span className="text-muted">
                              {time(appt.starts_at)} · {appt.treatment?.name ?? "Turno"}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </span>
                    <span className="text-right md:text-left">
                      {debt ? (
                        <Badge tone="danger" className="tabular-nums">
                          {[debt.USD > 0 ? money(debt.USD, "USD") : null, debt.ARS > 0 ? money(debt.ARS) : null].filter(Boolean).join(" + ")}
                        </Badge>
                      ) : (
                        <span className="hidden text-sm text-faint md:inline">Al día</span>
                      )}
                    </span>
                    <span className="hidden truncate text-right text-xs text-muted md:block">{p.source ?? "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > limit ? (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit((l) => l + 150)}>
              Mostrar más ({list.length - limit})
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
