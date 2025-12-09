import React, { useState, useContext } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Image } from "@nextui-org/react";
import { useRouter } from "next/router";
import { NostrContext, SignerContext } from "@/components/utility-components/nostr-context-provider";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { FileUploaderButton } from "./utility-components/file-uploader";

export default function ZapsnagForm({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const { signer } = useContext(SignerContext);
  
  const [content, setContent] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePost = async () => {
    if (!signer || !nostr) return;
    if (!content || !price) return;

    setLoading(true);
    try {
      const finalContent = `${content}\n\nPrice: ${price} sats\n\n#zapsnag\n${image}`;

      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["t", "zapsnag"], 
            ["d", "zapsnag"],
            ["t", "shopstr-zapsnag"]
        ],
        content: finalContent,
      };

      if (image) {
          eventTemplate.tags.push(["image", image]);
      }

      await finalizeAndSendNostrEvent(signer, nostr, eventTemplate);
      
      setContent("");
      setPrice("");
      setImage("");
      onClose();
      
      router.replace(router.pathname); 
      
    } catch (e) {
      console.error(e);
      alert("Failed to post Flash Sale");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" backdrop="blur">
      <ModalContent>
        <ModalHeader>Post Flash Sale (Zapsnag)</ModalHeader>
        <ModalBody>
          <p className="text-sm text-gray-500">
            Create a quick social post that Shopstr users can Zap to buy instantly.
          </p>
          
          <div className="flex flex-col gap-4 mt-2">
            {/* Image Uploader */}
            <div className="flex justify-center">
                {image ? (
                    <div className="relative">
                        <Image src={image} alt="Preview" className="h-48 object-cover rounded-lg" />
                        <Button size="sm" color="danger" variant="flat" className="absolute top-2 right-2" onClick={() => setImage("")}>Remove</Button>
                    </div>
                ) : (
                    <div className="h-32 w-full border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                         <FileUploaderButton 
                            className={SHOPSTRBUTTONCLASSNAMES} 
                            imgCallbackOnUpload={(url) => setImage(url)}
                         >
                            Upload Product Image
                         </FileUploaderButton>
                    </div>
                )}
            </div>

            <Textarea 
                label="What are you selling?" 
                placeholder="Describe your item..." 
                value={content} 
                onValueChange={setContent}
                minRows={3}
            />
            
            <Input 
                label="Price (sats)" 
                type="number" 
                placeholder="2100" 
                value={price} 
                onValueChange={setPrice}
                startContent={<span className="text-default-400 text-sm">⚡</span>}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onClick={onClose}>Cancel</Button>
          <Button 
            className={SHOPSTRBUTTONCLASSNAMES} 
            isLoading={loading}
            isDisabled={!content || !price}
            onClick={handlePost}
          >
            Post Flash Sale
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}