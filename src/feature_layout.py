"""Bar feature layout for four beats and 13 MFCC coefficients per beat."""

CHROMA_SLICE = slice(0, 48)
MFCC_SLICE = slice(48, 100)
RMS_SLICE = slice(100, 104)
CENTROID_SLICE = slice(104, 108)
ONSET_SLICE = slice(108, 112)
N_BAR_FEATURES = ONSET_SLICE.stop
