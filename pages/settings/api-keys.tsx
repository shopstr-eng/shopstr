import { useState, useEffect, useContext, useCallback } from "react";
import { Button, Input, Select, SelectItem, Spinner } from "@nextui-org/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  BLUEBUTTONCLASSNAMES,
  DANGERBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  ClipboardDocumentIcon,
  KeyIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

interface ApiKeyItem {
  id: number;
  key_prefix: string;
  name: string;
  permissions: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

const ApiKeysPage = () => {
  const { pubkey, isLoggedIn } = useContext(SignerContext);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermission, setNewKeyPermission] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!pubkey) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/mcp/api-keys?pubkey=${pubkey}`);
      const data = await res.json();
      if (data.keys) {
        setApiKeys(data.keys);
      }
    } catch {
      setError("Failed to load API keys.");
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    if (pubkey) {
      fetchKeys();
    }
  }, [pubkey, fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      setError("Please enter a name for your API key.");
      return;
    }
    setIsCreating(true);
    setError(null);
    setCreatedKey(null);
    try {
      const res = await fetch("/api/mcp/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          permissions: newKeyPermission,
          pubkey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedKey(data.key);
        setNewKeyName("");
        setNewKeyPermission("read");
        await fetchKeys();
      } else {
        setError(data.error || "Failed to create API key.");
      }
    } catch {
      setError("Failed to create API key.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/mcp/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pubkey }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("API key revoked.");
        await fetchKeys();
      } else {
        setError(data.error || "Failed to revoke API key.");
      }
    } catch {
      setError("Failed to revoke API key.");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const mcpEndpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp";

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen flex-col bg-white pb-20 pt-24">
        <div className="mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
          <SettingsBreadCrumbs />
          <div className="mt-8 rounded-md border-2 border-black bg-yellow-50 p-6 shadow-neo">
            <p className="text-center text-lg font-bold text-black">
              Please sign in to manage API keys.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white pb-20 pt-24">
      <div className="mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
        <SettingsBreadCrumbs />

        <div className="mb-8">
          <h2 className="mb-2 text-2xl font-bold text-black">MCP Connection</h2>
          <div className="rounded-md border-2 border-black bg-gray-50 p-4 shadow-neo">
            <div className="mb-3 flex items-start gap-2">
              <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-600" />
              <p className="text-sm text-gray-700">
                Use the endpoint URL below to connect AI agents to Milk Market
                via the Model Context Protocol (MCP). Include your API key in
                the{" "}
                <code className="rounded bg-gray-200 px-1">Authorization</code>{" "}
                header as a Bearer token.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border-2 border-black bg-white px-3 py-2 text-sm">
                {mcpEndpointUrl}
              </code>
              <button
                onClick={() => handleCopy(mcpEndpointUrl)}
                className="rounded-md border-2 border-black bg-white p-2 transition-colors hover:bg-primary-yellow"
              >
                <ClipboardDocumentIcon className="h-5 w-5 text-black" />
              </button>
            </div>
            <div className="mt-3 rounded-md border-2 border-black bg-white p-3">
              <p className="mb-1 text-xs font-bold text-gray-600">
                Example usage:
              </p>
              <code className="block whitespace-pre-wrap break-all text-xs text-gray-700">
                {`curl ${mcpEndpointUrl} \\
  -H "Authorization: Bearer mm_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"method": "tools/list"}'`}
              </code>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center rounded-md border-2 border-black bg-red-100 p-3 text-red-700 shadow-neo">
            <ExclamationCircleIcon className="mr-2 h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-center rounded-md border-2 border-black bg-green-100 p-3 text-green-700 shadow-neo">
            <CheckCircleIcon className="mr-2 h-5 w-5" />
            <span className="text-sm">{successMessage}</span>
          </div>
        )}

        {createdKey && (
          <div className="mb-6 rounded-md border-2 border-black bg-green-50 p-4 shadow-neo">
            <p className="mb-2 text-sm font-bold text-green-800">
              API key created! Copy it now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border-2 border-black bg-white px-3 py-2 font-mono text-sm">
                {createdKey}
              </code>
              <button
                onClick={() => handleCopy(createdKey)}
                className="rounded-md border-2 border-black bg-white p-2 transition-colors hover:bg-primary-yellow"
              >
                {copied ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                ) : (
                  <ClipboardDocumentIcon className="h-5 w-5 text-black" />
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-bold text-black">Create API Key</h2>
          <div className="space-y-4 rounded-md border-2 border-black bg-white p-4 shadow-neo">
            <Input
              label="Key Name"
              placeholder="e.g., My AI Agent"
              value={newKeyName}
              onValueChange={setNewKeyName}
              classNames={{
                label: "text-black",
                input: "!text-black",
                inputWrapper:
                  "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white group-data-[focus=true]:border-black",
                innerWrapper: "text-black",
              }}
            />
            <Select
              label="Permissions"
              selectedKeys={[newKeyPermission]}
              onChange={(e) => setNewKeyPermission(e.target.value)}
              classNames={{
                trigger:
                  "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white",
                label: "text-black",
                value: "text-black",
              }}
            >
              <SelectItem key="read" value="read">
                Read Only — Browse products, profiles, reviews
              </SelectItem>
              <SelectItem key="read_write" value="read_write">
                Read + Write — Browse and place orders
              </SelectItem>
            </Select>
            <Button
              className={BLUEBUTTONCLASSNAMES}
              onClick={handleCreate}
              isLoading={isCreating}
              isDisabled={!newKeyName.trim()}
            >
              {isCreating ? "Creating..." : "Generate API Key"}
            </Button>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-bold text-black">Your API Keys</h2>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : apiKeys.length === 0 ? (
            <p className="text-gray-500">No API keys created yet.</p>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`rounded-md border-2 border-black p-4 shadow-neo ${
                    key.is_active ? "bg-white" : "bg-gray-100 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <KeyIcon className="h-5 w-5 text-black" />
                        <span className="font-bold text-black">{key.name}</span>
                        {!key.is_active && (
                          <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            Revoked
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <p>
                          Key:{" "}
                          <code className="rounded bg-gray-100 px-1">
                            {key.key_prefix}...
                          </code>
                        </p>
                        <p>
                          Permissions:{" "}
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                              key.permissions === "read_write"
                                ? "border-blue-300 bg-blue-100 text-blue-700"
                                : "border-gray-300 bg-gray-100 text-gray-700"
                            }`}
                          >
                            {key.permissions === "read_write"
                              ? "Read + Write"
                              : "Read Only"}
                          </span>
                        </p>
                        <p>Created: {formatDate(key.created_at)}</p>
                        <p>Last used: {formatDate(key.last_used_at)}</p>
                      </div>
                    </div>
                    {key.is_active && (
                      <Button
                        className={DANGERBUTTONCLASSNAMES}
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
                      >
                        <TrashIcon className="h-4 w-4" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiKeysPage;
