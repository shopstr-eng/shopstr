# Jotai Pilot: File Uploader Flow

## What was implemented
- Replaced local useState with Jotai atom (loadingAtom)
- Integrated atom into file uploader component

## Scenario Tested
- Uploading single and multiple images

## Observations
- Upload flow works correctly without UI issues
- Loading state updates are consistent
- Updates remain mostly localized to uploader component
- No clear cascade re-renders observed across unrelated components

## Insight
Jotai's atomic model helps isolate state updates,
making it suitable for localized UI state like file uploads.

## Additional Observation
- Observed multiple re-renders of FileUploader during upload interactions
- Likely due to parent component updates or intermediate state changes during upload flow
- Suggests scope for further optimization in component structure or state handling