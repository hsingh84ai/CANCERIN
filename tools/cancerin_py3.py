#!/usr/bin/env python3
"""Faithful Python 3 port of the legacy CANCERIN.py (potency-score variant).

Ubuntu 24.04 has no python2 package, so the original cannot be run. This port
is mechanical and deliberately preserves the original's quirks so its output is
comparable, including:

  * the off-by-one slices arr[0:8564] / arr[8565:18368] (author meant 0:8565)
  * selecting the best match by STRING comparison of fixed-format decimals
  * .index() on the unsorted list, i.e. first occurrence of the max
  * Python 2 round() semantics -- half away from zero, NOT banker's rounding,
    which is what python3's round() would give

Deviations from the original, all inert:
  * numpy dropped; np.where(a == 1)[0] is just "indices where the value is 1"
  * cPickle -> pickle with latin1 encoding (protocol 0, py2-written)

Usage:
    python3 cancerin_py3.py <query.smi> <output.csv> [--fix-column-order FILE]

--fix-column-order takes data/column-order.json and writes the query columns in
the same feature-importance order cancerin-fingerprint uses, instead of
ascending imp-no order. That is the one-line fix for the original's bug.
"""
import json
import os
import pickle
import sys

argv = [a for a in sys.argv if not a.startswith("--")]
fixarg = next((a for a in sys.argv if a.startswith("--fix-column-order")), None)
if len(argv) != 3:
    sys.exit("Usage: %s <query.smi> <output.csv> [--fix-column-order=FILE]" % sys.argv[0])


def py2_round(x, n):
    """Python 2's round(): half away from zero."""
    from decimal import Decimal, ROUND_HALF_UP
    d = Decimal(repr(x)).quantize(Decimal("1." + "0" * n), rounding=ROUND_HALF_UP)
    return float(d)


print("Running cancerin_standard_alone.jar-----please wait!")
javaoption = "-Xmx1024M"
jarfile = "PaDEL-Descriptor.jar"
padeloptions = "-fingerprints -descriptortypes descriptors.xml -dir"
java_outfile = "-file cancerin_out"
inputfile = argv[1]

cmd_run_jar = " ".join(["java", javaoption, "-jar", jarfile, padeloptions, inputfile, java_outfile])
print("Running cancerin_standard_alone.jar-----initiating fingerprint calculation")
os.system(cmd_run_jar)

# reading important fingerprints
with open("imp-no") as ins1:
    arrf = [line for line in ins1]
flen = len(arrf)

# The original always reads imp-no in file (ascending) order. cancerin-fingerprint
# was written in feature-importance order, so these never line up -- that is the
# bug. With --fix-column-order we emit the query columns in the stored order.
order = None
if fixarg:
    p = fixarg.split("=", 1)[1] if "=" in fixarg else "data/column-order.json"
    with open(p) as fh:
        order = json.load(fh)["order"]
    print("column order: FIXED (feature-importance order from %s)" % p)
else:
    print("column order: ascending imp-no, as the original does")

# filtering important fingerprints
with open("cancerin_out") as ins:
    array = [line for line in ins]
qid = []
tlen = len(array)
with open("queryfp", "w") as f:
    for x in range(1, tlen):
        finger = array[x].rstrip()
        arr = finger.split(",")
        na = arr[0]
        qid.append(na)
        query = []
        for y in range(flen):
            slot = order[y] if order else y
            z = int(arrf[slot].rstrip())
            s = arr[z]
            if s == "":
                s = "0"
            query.append(s)
        f.write(",".join(query))
        f.write("\n")


def tanimoto_file(outname, want):
    """Original's TC1 (want=1) / TC0 (want=0) loops, verbatim in structure."""
    with open("queryfp") as fh1, open("cancerin-fingerprint") as fh2:
        header1 = fh1.read()
        header2 = fh2.read()
    name1 = header1.split("\n")
    name2 = header2.split("\n")
    hight1 = len(name1) - 1
    hight2 = len(name2) - 1
    # Parse the background once instead of re-splitting inside the inner loop.
    bg = [frozenset(i for i, v in enumerate(name2[y].strip("\n").split(",")) if int(v) == want)
          for y in range(hight2)]
    with open(outname, "w") as f1:
        for x in range(hight1):
            kdx = name1[x].strip("\n").split(",")
            kda = frozenset(i for i, v in enumerate(kdx) if int(v) == want)
            mylist = []
            for kdb in bg:
                u = len(kda | kdb)
                i = len(kda & kdb)
                tc = 0 if u == 0 else i / u
                tc = py2_round((tc * 100) / 100, 3)
                mylist.append(str(tc))
            f1.write(",".join(mylist))
            f1.write("\n")


tanimoto_file("tc1", 1)
print("Running cancerin_standard_alone.jar----- TC1 calculation over")
tanimoto_file("tc0", 0)
print("Running cancerin_standard_alone.jar----- TC0 calculation over")

with open("tc1") as fh1, open("tc0") as fh2:
    header1 = fh1.read()
    header2 = fh2.read()
name1 = header1.split("\n")
name2 = header2.split("\n")
hight1 = len(name1) - 1
ids = []
rss = []
tca = []
for x in range(hight1):
    arr1 = str(name1[x].rstrip()).split(",")
    ara1 = arr1[0:8564]
    ari1 = arr1[8565:18368]          # <- original off-by-one, preserved
    ara11 = sorted(ara1)
    ari1s = sorted(ari1)
    maxa1 = str(ara11.pop())
    maxi1 = str(ari1s.pop())

    arr0 = str(name2[x].rstrip()).split(",")
    ara0 = arr0[0:8564]
    ari0 = arr0[8565:18368]
    ara00 = sorted(ara0)
    ari0s = sorted(ari0)
    maxa0 = str(ara00.pop())
    maxi0 = str(ari0s.pop())

    if maxa1 >= maxa0:               # <- string comparison, preserved
        maxa = maxa1
        lno = ara1.index(maxa1)
    else:
        maxa = maxa0
        lno = ara0.index(maxa0)

    maxi = maxi1 if maxi1 >= maxi0 else maxi0
    rs = str(float(maxa) - float(maxi))
    ids.append(lno)
    rss.append(rs)
    tca.append(maxa)

header = "#Qurey,Match_nscID,Match_pubchemSID,Mean_logGI50,Potency_Score,Maximum_tanimoto_Similarity_Score"
with open("ids.cpk", "rb") as fp:
    drugbackground = pickle.load(fp, encoding="latin1")
ncititles = drugbackground["ncititles"]
nsc2sid = drugbackground["nsc2sid"]
GI50 = drugbackground["GI50"]
with open(argv[2], "w") as outfile:
    outfile.write("%s\n" % header)
    for x in range(len(ids)):
        NSCID = ncititles[ids[x]]
        this_arr = ",".join([str(qid[x]), NSCID, nsc2sid[NSCID], GI50[NSCID], str(rss[x]), str(tca[x])])
        outfile.write("%s\n" % this_arr)

for tmp in ("tc1", "tc0", "queryfp", "cancerin_out"):
    os.remove(tmp)
print("Running cancerin_standard_alone.jar-----completed!")
