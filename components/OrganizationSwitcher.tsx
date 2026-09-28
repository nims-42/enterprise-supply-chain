"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/client-api";

interface OrganizationsResponse {
  organizations: { organization_id: number; name: string; industry: string | null }[];
  current_organization_id: number;
}

/**
 * Dropdown in the sidebar that picks which organization the app works for.
 * Switching sets a cookie through the API, then reloads the current section
 * (e.g. /products) so every page fetches that organization's data.
 */
export default function OrganizationSwitcher() {
  const pathname = usePathname();
  const [data, setData] = useState<OrganizationsResponse | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    apiFetch<OrganizationsResponse>("/api/organizations")
      .then(setData)
      .catch(() => {});
  }, []);

  async function handleChange(organizationId: number) {
    setSwitching(true);
    try {
      await apiFetch("/api/organizations/current", {
        method: "PUT",
        body: JSON.stringify({ organization_id: organizationId }),
      });
      // Go to the top of the current section: a detail page like
      // /products/101 belongs to the old organization and would 404.
      const section = pathname.split("/")[1];
      window.location.assign(section ? `/${section}` : "/");
    } catch {
      setSwitching(false);
    }
  }

  if (!data) {
    return <div className="h-9 rounded-md bg-slate-100" />;
  }

  const current = data.organizations.find(
    (o) => o.organization_id === data.current_organization_id,
  );

  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Organization
        <select
          value={data.current_organization_id}
          onChange={(e) => handleChange(Number(e.target.value))}
          disabled={switching}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-slate-900 disabled:opacity-50"
        >
          {data.organizations.map((o) => (
            <option key={o.organization_id} value={o.organization_id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {current?.industry && <p className="mt-1 text-xs text-slate-500">{current.industry}</p>}
    </div>
  );
}
