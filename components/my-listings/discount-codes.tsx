import React, { useContext, useEffect, useState } from "react";
import {
  Button,
  Input,
  Card,
  CardBody,
  CardHeader,
  Chip,
} from "@nextui-org/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
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
        <h2 className="mb-2 text-2xl font-bold text-light-text dark:text-dark-text">
          Discount Codes
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Create discount codes that customers can use at checkout to reduce the
          price of all products in their order.
        </p>
      </div>

      <Card className="bg-light-fg dark:bg-dark-fg">
        <CardHeader>
          <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
            Add New Discount Code
          </h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Code"
            placeholder="SUMMER2024"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            className="text-light-text dark:text-dark-text"
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
            endContent={<span className="text-default-400">%</span>}
            className="text-light-text dark:text-dark-text"
          />
          <Input
            type="datetime-local"
            label="Expiration (Optional)"
            placeholder="Select expiration date"
            value={newExpiration}
            onChange={(e) => setNewExpiration(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="text-light-text dark:text-dark-text"
          />
          <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={handleAddCode}
            isDisabled={!newCode || !newDiscount || isSaving}
            isLoading={isSaving}
          >
            Add Code
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
          Active Codes
        </h3>
        {isLoading ? (
          <p className="text-light-text dark:text-dark-text">Loading...</p>
        ) : codes.length === 0 ? (
          <Card className="bg-light-fg dark:bg-dark-fg">
            <CardBody>
              <p className="text-center text-gray-500">
                No discount codes yet. Create one above!
              </p>
            </CardBody>
          </Card>
        ) : (
          codes.map((code) => (
            <Card key={code.code} className="bg-light-fg dark:bg-dark-fg">
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-light-text dark:text-dark-text">
                        {code.code}
                      </span>
                      {isExpired(code.expiration) && (
                        <Chip color="warning" size="sm">
                          Expired
                        </Chip>
                      )}
                    </div>
                    <p className="text-sm text-light-text dark:text-dark-text">
                      {code.discount_percentage}% off
                    </p>
                    {code.expiration && (
                      <p className="text-xs text-gray-500">
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
