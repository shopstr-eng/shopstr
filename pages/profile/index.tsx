import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { ProfileMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Image,
  Button,
  Divider,
  Tabs,
  Tab,
  Input,
  Textarea,
  Spinner,
} from "@nextui-org/react";
import {
  UserIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";

export default function ProfilePage() {
  const router = useRouter();
  const signerContext = useContext(SignerContext);
  const profileContext = useContext(ProfileMapContext);
  const [profile, setProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    about: "",
    picture: "",
    nip05: "",
  });

  useEffect(() => {
    if (!signerContext || !signerContext.pubkey) {
      setIsLoading(false);
      return;
    }

    const profileMap = profileContext.profileData;
    const userProfile = profileMap.has(signerContext.pubkey) 
      ? profileMap.get(signerContext.pubkey) 
      : null;
    
    setProfile(userProfile);
    if (userProfile) {
      setFormData({
        name: userProfile.content.name || "",
        about: userProfile.content.about || "",
        picture: userProfile.content.picture || "",
        nip05: userProfile.content.nip05 || "",
      });
    }
    setIsLoading(false);
  }, [signerContext, profileContext]);

  const handleSave = () => {
    // TODO: Implement profile update logic
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!signerContext || !signerContext.pubkey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4">Please sign in to view your profile</h1>
        <Button 
          color="primary"
          onPress={() => router.push("/")}
        >
          Go to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="flex gap-3">
          <Image
            alt="Profile picture"
            height={100}
            radius="full"
            src={profile?.content?.picture || `https://robohash.org/${signerContext.pubkey}`}
            width={100}
            className="object-cover"
          />
          <div className="flex flex-col">
            <p className="text-xl font-bold">
              {profile?.content?.name || "Anonymous"}
            </p>
            <p className="text-small text-gray-500">
              {profile?.content?.nip05 || nip19.npubEncode(signerContext.pubkey)}
            </p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody>
          <Tabs aria-label="Profile options">
            <Tab
              key="profile"
              title={
                <div className="flex items-center space-x-2">
                  <UserIcon className="h-5 w-5" />
                  <span>Profile</span>
                </div>
              }
            >
              {isEditing ? (
                <div className="space-y-4">
                  <Input
                    label="Name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                  <Textarea
                    label="About"
                    value={formData.about}
                    onChange={(e) =>
                      setFormData({ ...formData, about: e.target.value })
                    }
                  />
                  <Input
                    label="Profile Picture URL"
                    value={formData.picture}
                    onChange={(e) =>
                      setFormData({ ...formData, picture: e.target.value })
                    }
                  />
                  <Input
                    label="NIP-05 Identifier"
                    value={formData.nip05}
                    onChange={(e) =>
                      setFormData({ ...formData, nip05: e.target.value })
                    }
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      color="danger"
                      variant="light"
                      onPress={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button color="primary" onPress={handleSave}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-700 dark:text-gray-300">
                    {profile?.content?.about || "No bio available"}
                  </p>
                  <Button
                    startContent={<PencilIcon className="h-5 w-5" />}
                    onPress={() => setIsEditing(true)}
                  >
                    Edit Profile
                  </Button>
                </div>
              )}
            </Tab>
            <Tab
              key="shop"
              title={
                <div className="flex items-center space-x-2">
                  <BuildingStorefrontIcon className="h-5 w-5" />
                  <span>Shop</span>
                </div>
              }
            >
              <div className="text-center py-8">
                <p className="text-gray-500">No shop settings available</p>
                <Button
                  className="mt-4"
                  onPress={() => router.push("/settings/shop-settings")}
                >
                  Configure Shop
                </Button>
              </div>
            </Tab>
            <Tab
              key="settings"
              title={
                <div className="flex items-center space-x-2">
                  <Cog6ToothIcon className="h-5 w-5" />
                  <span>Settings</span>
                </div>
              }
            >
              <div className="text-center py-8">
                <p className="text-gray-500">No settings available</p>
                <Button
                  className="mt-4"
                  onPress={() => router.push("/settings")}
                >
                  Go to Settings
                </Button>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
} 