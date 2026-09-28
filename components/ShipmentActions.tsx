"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import { statusChangeSchema } from "@/lib/validation/shipment";
import type { ShipmentDetail, ShipmentStatus, TransportListItem } from "@/lib/types";

interface Props {
  shipment: ShipmentDetail;
  onChanged: () => void;
}

interface ReceivedLine {
  key: number;
  productId: string;
  quantity: string;
}

let nextKey = 1;

const LABELS: Record<ShipmentStatus, string> = {
  CREATED: "Created",
  PACKED: "Mark packed",
  DISPATCHED: "Dispatch",
  IN_TRANSIT: "Mark in transit",
  DELAYED: "Mark delayed",
  DELIVERED: "Mark delivered",
  CANCELLED: "Cancel shipment",
};

/**
 * The buttons for whatever statuses this shipment may move to next (the API
 * sends `next_statuses`). Dispatch asks for a vehicle; delivering an INBOUND
 * shipment asks what arrived.
 */
export default function ShipmentActions({ shipment, onChanged }: Props) {
  const [vehicles, setVehicles] = useState<TransportListItem[]>([]);
  const [transportId, setTransportId] = useState("");
  const [lines, setLines] = useState<ReceivedLine[]>(() => [
    { key: nextKey++, productId: "", quantity: "" },
  ]);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDispatch = shipment.next_statuses.includes("DISPATCHED");
  const canDeliver = shipment.next_statuses.includes("DELIVERED");
  const inbound = shipment.shipment_type === "INBOUND";

  useEffect(() => {
    if (!canDispatch) return;
    apiFetch<TransportListItem[]>("/api/transport?status=AVAILABLE")
      .then(setVehicles)
      .catch(() => {});
  }, [canDispatch]);

  async function move(status: ShipmentStatus) {
    setError(null);
    const body: Record<string, unknown> = { status };

    if (status === "DISPATCHED") {
      if (!inbound && !transportId) {
        setError("Choose a vehicle to dispatch on.");
        return;
      }
      body.transport_id = transportId ? Number(transportId) : null;
    }
    if (status === "DELIVERED" && inbound) {
      body.received = lines
        .filter((l) => l.productId !== "")
        .map((l) => ({
          product_id: Number(l.productId),
          quantity: l.quantity.trim() === "" ? undefined : Number(l.quantity),
        }));
    }

    const parsed = statusChangeSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    try {
      await apiFetch(`/api/shipments/${shipment.shipment_id}/status`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setConfirmingCancel(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (shipment.next_statuses.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        This shipment is {shipment.status.toLowerCase()}; there is nothing more to do.
      </p>
    );
  }

  const primary =
    "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
  const secondary =
    "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50";

  const simple = shipment.next_statuses.filter(
    (s) => !["DISPATCHED", "DELIVERED", "CANCELLED"].includes(s),
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canDispatch && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">
            {inbound ? "Our vehicle (optional)" : "Vehicle"}
            <select
              value={transportId}
              onChange={(e) => setTransportId(e.target.value)}
              className="mt-1 block w-72 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">
                {inbound ? "Producer's own transport" : "Choose an available vehicle..."}
              </option>
              {vehicles.map((v) => (
                <option key={v.transport_id} value={v.transport_id}>
                  {v.vehicle_number} ({v.transport_type.toLowerCase()},{" "}
                  {v.capacity.toLocaleString("en-IN")} kg)
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => move("DISPATCHED")} disabled={busy} className={primary}>
            Dispatch
          </button>
          {!inbound && vehicles.length === 0 && (
            <p className="text-xs text-amber-800">No vehicle is available right now.</p>
          )}
        </div>
      )}

      {canDeliver && inbound && (
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium">What arrived?</p>
          <p className="text-xs text-slate-500">
            These quantities are added to {shipment.warehouse}&apos;s stock when you mark it
            delivered. Only products this producer supplies are listed.
          </p>
          <div className="mt-3 space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap items-center gap-2">
                <select
                  value={line.productId}
                  onChange={(e) =>
                    setLines((c) =>
                      c.map((l) => (l.key === line.key ? { ...l, productId: e.target.value } : l)),
                    )
                  }
                  className="w-72 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a product...</option>
                  {shipment.receivable_products
                    .filter(
                      (p) =>
                        String(p.product_id) === line.productId ||
                        !lines.some((l) => l.productId === String(p.product_id)),
                    )
                    .map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product} ({p.sku})
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((c) =>
                      c.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)),
                    )
                  }
                  className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                    className="text-sm text-slate-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((c) => [...c, { key: nextKey++, productId: "", quantity: "" }])}
            className="mt-2 text-sm font-medium text-slate-700 hover:underline"
          >
            + Add product
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canDeliver && (
          <button onClick={() => move("DELIVERED")} disabled={busy} className={primary}>
            Mark delivered
          </button>
        )}
        {simple.map((s) => (
          <button key={s} onClick={() => move(s)} disabled={busy} className={secondary}>
            {LABELS[s]}
          </button>
        ))}
        {shipment.next_statuses.includes("CANCELLED") &&
          (confirmingCancel ? (
            <>
              <button
                onClick={() => move("CANCELLED")}
                disabled={busy}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Yes, cancel shipment
              </button>
              <button onClick={() => setConfirmingCancel(false)} className={secondary}>
                Keep it
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Cancel shipment
            </button>
          ))}
      </div>
      {confirmingCancel && !inbound && (
        <p className="text-xs text-amber-800">
          The stock reserved for this order is released and the order goes back to Pending, so it
          can be confirmed from another warehouse.
        </p>
      )}
    </div>
  );
}
