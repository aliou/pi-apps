import {
  CaretUpDownIcon,
  CheckIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { createListCollection } from "@ark-ui/react/combobox";
import type { GitHubRepo } from "../lib/api";
import { fuzzyFilterRepos } from "../lib/repo-search";
import { Combobox, type ComboboxRootProps } from "./ui";


export interface RepoComboboxProps {
  repos: GitHubRepo[];
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  maxItems?: number;
}

export function RepoCombobox({
  repos,
  query,
  onQueryChange,
  placeholder = "Search repos (fuzzy)…",
  maxItems = 10,
}: RepoComboboxProps) {
  const filtered = useMemo(() => fuzzyFilterRepos(repos, query), [repos, query]);

  const items = useMemo(
    () => filtered.slice(0, maxItems),
    [filtered, maxItems],
  );

  const collection = useMemo(
    () => createListCollection({ items: items.map((repo) => repo.fullName) }),
    [items],
  );

  const handleInputValueChange: NonNullable<
    ComboboxRootProps["onInputValueChange"]
  > = (details) => {
    onQueryChange(details.inputValue ?? "");
  };

  const handleValueChange: NonNullable<ComboboxRootProps["onValueChange"]> = (
    details,
  ) => {
    const selected = details.value?.[0];
    if (selected) onQueryChange(selected);
  };

  return (
    <Combobox
      collection={collection}
      inputValue={query}
      onInputValueChange={handleInputValueChange}
      onValueChange={handleValueChange}
      selectionBehavior="replace"
      positioning={{ sameWidth: true }}
    >
      <Combobox.Control>
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted/70" />
        <Combobox.Input placeholder={placeholder} className="pl-9 pr-9" />
        <Combobox.Trigger aria-label="Toggle repository suggestions">
          <CaretUpDownIcon className="size-4" />
        </Combobox.Trigger>
      </Combobox.Control>

      <Combobox.Positioner>
        <Combobox.Content>
          {items.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted">No matching repositories.</div>
          ) : (
            items.map((repo) => (
              <Combobox.Item key={repo.id} item={repo.fullName}>
                <div className="flex min-w-0 items-center gap-2">
                  {repo.isPrivate && (
                    <LockKeyIcon className="size-3.5 shrink-0 text-muted/60" />
                  )}
                  <div className="min-w-0">
                    <Combobox.ItemText>{repo.fullName}</Combobox.ItemText>
                    {repo.description ? (
                      <p className="truncate text-xs text-muted">{repo.description}</p>
                    ) : null}
                  </div>
                </div>
                <Combobox.ItemIndicator>
                  <CheckIcon className="size-3.5" weight="bold" />
                </Combobox.ItemIndicator>
              </Combobox.Item>
            ))
          )}
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox>
  );
}
