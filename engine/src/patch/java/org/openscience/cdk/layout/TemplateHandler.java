package org.openscience.cdk.layout;

import java.util.ArrayList;
import java.util.List;

import org.openscience.cdk.exception.CDKException;
import org.openscience.cdk.interfaces.IAtomContainer;
import org.openscience.cdk.interfaces.IAtomContainerSet;
import org.openscience.cdk.interfaces.IChemObjectBuilder;

/**
 * TeaVM-safe replacement for CDK 1.4.6's TemplateHandler.
 *
 * The original loads a CML template library through CMLReader, which needs SAX.
 * StructureDiagramGenerator.setMolecule constructs a TemplateHandler
 * unconditionally, so setUseTemplates(false) does not avoid the dependency —
 * the class has to go.
 *
 * Templates only give common ring systems a nicer canned layout; without them
 * StructureDiagramGenerator computes coordinates itself. The depiction is
 * therefore slightly less pretty for some polycyclics and otherwise identical,
 * and no fingerprint or score is affected — this class is reachable only from
 * the drawing path.
 *
 * Part of the patched cdk-teavm jar; see tools/build-cdk-teavm.sh.
 */
public class TemplateHandler {

    private final List<IAtomContainer> templates = new ArrayList<IAtomContainer>();
    private final IChemObjectBuilder builder;

    public TemplateHandler(IChemObjectBuilder builder) {
        this.builder = builder;
    }

    /** No-op: the template library is not carried in the browser build. */
    public void loadTemplates(IChemObjectBuilder builder) {
    }

    public void addMolecule(IAtomContainer molecule) {
        templates.add(molecule);
    }

    public IAtomContainer removeMolecule(IAtomContainer molecule) throws CDKException {
        return templates.remove(molecule) ? molecule : null;
    }

    /** No templates are loaded, so nothing ever matches. */
    public boolean mapTemplateExact(IAtomContainer molecule) throws CDKException {
        return false;
    }

    public boolean mapTemplates(IAtomContainer molecule) throws CDKException {
        return false;
    }

    public int getTemplateCount() {
        return templates.size();
    }

    public IAtomContainer getTemplateAt(int position) {
        return templates.get(position);
    }

    public IAtomContainerSet getMappedSubstructures(IAtomContainer molecule) throws CDKException {
        return builder.newInstance(IAtomContainerSet.class);
    }
}
