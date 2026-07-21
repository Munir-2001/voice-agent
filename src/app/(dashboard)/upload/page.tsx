import { PageHeader } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { FadeIn } from "@/components/motion";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Upload contacts"
        description="Add a CSV of leads. We validate phone numbers, drop duplicates, and honor the suppression list before anything is dialed."
      />
      <FadeIn>
        <UploadDropzone />
      </FadeIn>
    </div>
  );
}
