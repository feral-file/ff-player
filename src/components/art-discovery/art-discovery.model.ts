import { ArtFraming } from '@/services/AppControls';

export const artworkFramingOptions: ToggleOption[] = [
  { id: ArtFraming.FitToScreen, icon: 'fit-to-screen', label: 'Fit to Screen' },
  { id: ArtFraming.CropToFill, icon: 'crop-to-fill', label: 'Crop to Fill' },
];

export interface ToggleOption {
  id: number;
  icon: string;
  label: string;
}
