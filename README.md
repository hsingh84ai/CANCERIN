# Cancerin Standalone & Predictor

A molecular fingerprint similarity tool to predict input SMILES. This tool utilizes the PaDEL-Descriptor generator to calculate molecular fingerprints, filters them against key indices, and computes Tanimoto Coefficient similarities (TC1 & TC0) against a pre-compiled background database of active compounds.

---

## ⚙️ Current CLI Usage (Python 2.7)

The repository currently contains the CLI version of the tool.

### Prerequisites
* Python 2.7 (with `numpy` installed)
* Java Runtime Environment (JRE) (required for PaDEL-Descriptor.jar)

### Running Predictions
To run a prediction, pass your query SMILES file (e.g., `test.smi`) and designate an output file:

```bash
python CANCERIN.py test.smi output_results.csv

Folder Structure
CANCERIN.py: Main execution script.

PaDEL-Descriptor.jar: Java engine calculating molecular descriptors.

descriptors.xml: Configuration file detailing requested descriptor types.

ids.cpk: Serialized pickle database containing background NSC/PubChem compound mappings.

imp-no: Indices of targeted, important fingerprints.

test.smi: Sample query SMILES file.

🚀 Coming Soon: Cancerin Web App (Svelte 5)
We are currently rewriting this entire architecture to run 100% in the browser!

What's Changing:
Zero Installation: No Python or local Java runtimes required.

Fast Computations: Fingerprint generation will migrate from Java PaDEL to RDKit WebAssembly (WASM).

Client-side Execution: The Tanimoto matching logic will execute in milliseconds directly inside your browser using fast typed arrays.

Modern UI: Built using Svelte 5 and Tailwind CSS for real-time visualization and interactive reporting.

Stay tuned! The Svelte codebase migration starts soon.

References
[1] Singh, H., Kumar, R., Singh, S., Chaudhary, K., Gautam, A., & Raghava, G. P. S. (2016). Prediction of anticancer molecules using hybrid model developed on molecules screened against NCI-60 cancer cell lines. BMC Cancer, 16(1), 1-11. https://doi.org/10.1186/s12885-016-2082-y