import React, { useContext, useEffect, useState } from "react";
import { Card, CardBody, Divider } from "@nextui-org/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { CommunityContext } from "@/utils/context/context";
import { createOrUpdateCommunity } from "@/utils/nostr/nostr-helper-functions";
import CreateCommunityForm from "@/components/communities/CreateCommunityForm";
import { Community } from "@/utils/types/types";

const CommunityManagementPage = () => {
  const { signer, pubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const { communities } = useContext(CommunityContext);
  const [myCommunity, setMyCommunity] = useState<Community | null>(null);

  useEffect(() => {
    if (pubkey && communities.size > 0) {
      for (const community of communities.values()) {
        if (community.pubkey === pubkey) {
          setMyCommunity(community);
          break;
        }
      }
    }
  }, [pubkey, communities]);

  const handleSave = async (data: {
    name: string;
    description: string;
    image: string;
    d: string;
  }) => {
    if (!signer || !nostr || !pubkey) {
      alert("You must be logged in to create a community.");
      return;
    }
    try {
      await createOrUpdateCommunity(signer, nostr, {
        ...data,
        moderators: [pubkey], // Add creator as a moderator
      });
      alert("Community saved! It may take a few moments to appear.");
    } catch (error) {
      console.error("Failed to save community", error);
      alert("Failed to save community.");
    }
  };

  return (
    <div className="flex h-full flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <div className="mx-auto w-full max-w-3xl px-4">
        <SettingsBreadCrumbs />
        <Card>
          <CardBody>
            <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
              {myCommunity ? "Edit Your Community" : "Create Your Community"}
            </h2>
            <p className="mb-4 text-light-text/80 dark:text-dark-text/80">
              Create a space for your customers to gather and get updates.
            </p>
            <Divider className="my-4" />
            <CreateCommunityForm
              existingCommunity={myCommunity}
              onSave={handleSave}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default CommunityManagementPage;