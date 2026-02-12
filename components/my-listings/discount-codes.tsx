import React, { useContext, useEffect, useState } from "react";
import {
  Button,
  Input,
  Card,
  CardBody,
  Chip,
} from "@nextui-org/react";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";
import { TrashIcon } from "@heroicons/react/24/outline";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import ConfirmActionDropdown from "../utility-components/dropdowns/confirm-action-dropdown";

interface DiscountCode {
  code: string;
  discount_percentage: number;
  expiration: number | null;
}

export default function DiscountCodes() {
  const { pubkey } = useContext(SignerContext);
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [newExpiration, setNewExpiration] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (pubkey) {
      fetchCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]);

  const fetchCodes = async () => {
    if (!pubkey) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/db/discount-codes?pubkey=${pubkey}`);
      if (response.ok) {
        const data = await response.json();
        setCodes(data);
      }
    } catch (error) {
      console.error("Failed to fetch discount codes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCode = async () => {
    if (!pubkey || !newCode || !newDiscount) return;

    const discount = parseFloat(newDiscount);
    if (discount <= 0 || discount > 100) {
      alert("Discount must be between 0 and 100");
      return;
    }

    setIsSaving(true);
    try {
      const expiration = newExpiration
        ? Math.floor(new Date(newExpiration).getTime() / 1000)
        : undefined;

      const response = await fetch("/api/db/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.toUpperCase(),
          pubkey,
          discountPercentage: discount,
          expiration,
        }),
      });

      if (response.ok) {
        setNewCode("");
        setNewDiscount("");
        setNewExpiration("");
        await fetchCodes();
      } else {
        alert("Failed to add discount code");
      }
    } catch (error) {
      console.error("Failed to add discount code:", error);
      alert("Failed to add discount code");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCode = async (code: string) => {
    if (!pubkey) return;

    try {
      const response = await fetch("/api/db/discount-codes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pubkey }),
      });

      if (response.ok) {
        await fetchCodes();
      } else {
        alert("Failed to delete discount code");
      }
    } catch (error) {
      console.error("Failed to delete discount code:", error);
      alert("Failed to delete discount code");
    }
  };

  const isExpired = (expiration: number | null) => {
    if (!expiration) return false;
    return Date.now() / 1000 > expiration;
  };

  return (
    <div className="w-full space-y-6 p-4">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-black uppercase tracking-wide text-white">
          Discount Codes
        </h2>
        <p className="text-sm text-zinc-400">
          Create discount codes that customers can use at checkout to reduce the
          price of all products in their order.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#161616] p-4 shadow-none sm:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold uppercase tracking-wider text-white">
            Add New Discount Code
          </h3>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Code"
              placeholder="SUMMER2024"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              classNames={{
                input: "text-white placeholder:text-zinc-600 text-base",
                inputWrapper:
                  "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-14",
                label: "text-zinc-400",
              }}
              variant="bordered"
              labelPlacement="outside"
            />
            <Input
              type="number"
              label="Discount Percentage"
              placeholder="10"
              min="0.01"
              max="100"
              step="0.01"
              value={newDiscount}
              onChange={(e) => setNewDiscount(e.target.value)}
              endContent={<span className="text-zinc-500">%</span>}
              classNames={{
                input: "text-white placeholder:text-zinc-600 text-base",
                inputWrapper:
                  "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-14",
                label: "text-zinc-400",
              }}
              variant="bordered"
              labelPlacement="outside"
            />
          </div>
          <Input
            type="datetime-local"
            label="Expiration (Optional)"
            placeholder="Select expiration date"
            value={newExpiration}
            onChange={(e) => setNewExpiration(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            classNames={{
              input: "text-white placeholder:text-zinc-600 text-base",
              inputWrapper:
                "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-14",
              label: "text-zinc-400",
            }}
            variant="bordered"
            labelPlacement="outside"
          />
          <Button
            className={`${NEO_BTN} h-12 w-full text-sm font-bold tracking-wide`}
            onClick={handleAddCode}
            isDisabled={!newCode || !newDiscount || isSaving}
            isLoading={isSaving}
          >
            Add Code
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-bold uppercase tracking-wider text-white">
          Active Codes
        </h3>
        {isLoading ? (
          <p className="text-zinc-400">Loading...</p>
        ) : codes.length === 0 ? (
          <Card className="border border-dashed border-zinc-700 bg-transparent shadow-none">
            <CardBody>
              <p className="text-center text-zinc-500">
                No discount codes yet. Create one above!
              </p>
            </CardBody>
          </Card>
        ) : (
          codes.map((code) => (
            <Card
              key={code.code}
              className="rounded-xl border border-zinc-800 bg-[#161616] shadow-none"
            >
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xl font-bold text-white">
                        {code.code}
                      </span>
                      {isExpired(code.expiration) && (
                        <Chip
                          classNames={{
                            base: "bg-red-500/20 text-red-500 border border-red-500/50",
                          }}
                          size="sm"
                          variant="bordered"
                        >
                          Expired
                        </Chip>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300">
                      {code.discount_percentage}% off
                    </p>
                    {code.expiration && (
                      <p className="text-xs text-zinc-500">
                        {isExpired(code.expiration)
                          ? "Expired on: "
                          : "Expires: "}
                        {new Date(code.expiration * 1000).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <ConfirmActionDropdown
                    helpText="Are you sure you want to delete this discount code?"
                    buttonLabel="Delete Code"
                    onConfirm={() => handleDeleteCode(code.code)}
                  >
                    <Button isIconOnly color="danger" variant="light" size="sm">
                      <TrashIcon className="h-5 w-5" />
                    </Button>
                  </ConfirmActionDropdown>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
