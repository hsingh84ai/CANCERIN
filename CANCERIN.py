from __future__ import division
import time
from math import ceil, floor
import math
import decimal
import sys
import numpy as np
import os
import shutil
import cPickle

if len(sys.argv) != 3:
    sys.exit('Usage: %s Enter two arguments. First argument file having query smiles and second argument is output file' % sys.argv[0])

print "Running cancerin_standard_alone.jar-----please wait!"
#cancerin_standard_alone options
javaoption = '-Xmx1024M'
jarfile = 'PaDEL-Descriptor.jar'
padeloptions = '-fingerprints -descriptortypes descriptors.xml -dir'
java_outfile = '-file cancerin_out'
inputfile=sys.argv[1]

#cancerin runing padel for descriptor calculation
cmd_run_jar = ' '.join(['java',javaoption,'-jar',jarfile,padeloptions,inputfile,java_outfile])
print "Running cancerin_standard_alone.jar-----initiating fingerprint calculation"
os.system(cmd_run_jar)

#reading important fingerprints
ins1 = open("imp-no", "r" )
arrf = []
for line in ins1:
    arrf.append( line )
ins1.close()
flen = len(arrf)

#filtering important fingerprints
ins = open("cancerin_out", "r" )
#ins = open("12", "r" )
array = []
for line in ins:
    array.append( line )
ins.close()
qid = []
tlen = len(array)
#print tlen-1
f=open('queryfp','w')
for x in range(1,tlen):
	finger = array[x].rstrip()
	arr = finger.split(',')
#	finary = finger.split(,)
#	xlen= len(impno)
#	print impno[0]
	na = arr[0]
	qid.append(na)
	query = []
	for y in range(flen):
		z = int(arrf[y].rstrip())
		s = arr[z]
		if s == "":
			s = "0"
		query.append(s)
	fpq = ','.join(query)
	#print "heelo"
	f.write(fpq) 	
	f.write("\n")
f.close()

#calculate tc1
fh1=open('queryfp','r+')
fh2=open('cancerin-fingerprint','r+')
header1=fh1.read() # header is a STRING containing whole file
header2=fh2.read() # header is a STRING containing whole file
header1.strip('\n\n')
header2.strip('\n\n')
name1=header1.split('\n')#last element of aray is blank : ''
name2=header2.split('\n')#last element of aray is blank : ''
hight1=len(name1)-1
hight2=len(name2)-1
f1=open('tc1','w')
for x in range(hight1):
	name1[x]=name1[x].strip('\n')
	kdx=[int(j) for j in name1[x].split(",")]
	mylist=[]
	for y in range(hight2):
		name2[y]=name2[y].strip('\n')
		kdy=[int(j) for j in name2[y].split(",")]
		a = np.array(kdx)
		b = np.array(kdy)
		iia = np.where(a == 1)[0]
		iib = np.where(b == 1)[0]
		int_lista = map(int, iia)	#convert array to list
		int_listb = map(int, iib)	#convert array to list
		kda=set(int_lista)
		kdb=set(int_listb)
		u=len(kda|kdb)
		i=len(kda&kdb)
		if u==0:
                        tc=0
                else:
                        tc=i/u
		tc=round((tc*100)/100,3)
		kd=str(tc)
		mylist.append(kd)	#creating problem while printing as conventional technique
#	print ','.join(mylist) #this line converts conventional list format into the comma separated desirable format
	fpp = ','.join(mylist)
	f1.write(fpp) 	
	f1.write("\n")
f1.close()
fh1.close()
fh2.close()

print "Running cancerin_standard_alone.jar----- TC1 calculation over"
fh1=open('queryfp','r+')
fh2=open('cancerin-fingerprint','r+')
header1=fh1.read() # header is a STRING containing whole file
header2=fh2.read() # header is a STRING containing whole file
header1.strip('\n\n')
header2.strip('\n\n')
name1=header1.split('\n')#last element of aray is blank : ''
name2=header2.split('\n')#last element of aray is blank : ''
hight1=len(name1)-1
hight2=len(name2)-1
f0=open('tc0','w')
for x in range(hight1):
	name1[x]=name1[x].strip('\n')
	kdx=[int(j) for j in name1[x].split(",")]
	mylist=[]
	for y in range(hight2):
		name2[y]=name2[y].strip('\n')
		kdy=[int(j) for j in name2[y].split(",")]
		a = np.array(kdx)
		b = np.array(kdy)
		iia = np.where(a == 0)[0]
		iib = np.where(b == 0)[0]
		int_lista = map(int, iia)	#convert array to list
		int_listb = map(int, iib)	#convert array to list
		kda=set(int_lista)
		kdb=set(int_listb)
		u=len(kda|kdb)
		i=len(kda&kdb)
		if u==0:
                        tc=0
                else:
                        tc=i/u
		tc=round((tc*100)/100,3)
		kd=str(tc)
		mylist.append(kd)	#creating problem while printing as conventional technique
	fpn = ','.join(mylist)
	f0.write(fpn) 	
	f0.write("\n")
f0.close()
fh1.close()
fh2.close()

print "Running cancerin_standard_alone.jar----- TC0 calculation over"

fh1=open('tc1','r+')
fh2=open('tc0','r+')
header1=fh1.read() # header is a STRING containing whole file
header2=fh2.read() # header is a STRING containing whole file
header1.strip('\n\n')
header2.strip('\n\n')
name1=header1.split('\n')#last element of aray is blank : ''
name2=header2.split('\n')#last element of aray is blank : ''
hight1=len(name1)-1
hight2=len(name2)-1
ids = []
rss = []
tca = []
for x in range(hight1):
	name1[x]=name1[x].rstrip()
	name2[x]=name2[x].rstrip()
	ara1 = ara11 = ara0 = ara00 = ari1 = ari0 = arr1 = arr0 = []
	y = str(name1[x]); 	arr1 = y.split(',')
	ara1 = arr1[0:8564]; 	ari1 = arr1[8565:18368]
	ara11 = sorted(ara1); 	ari1 = sorted(ari1);
	maxa1 =	str(ara11.pop()); 	maxi1 =	str(ari1.pop());

	z = str(name2[x]); 	arr0 = z.split(',')
	ara0 = arr0[0:8564]; 	ari0 = arr0[8565:18368]
	ara00 = sorted(ara0); 	ari0 = sorted(ari0);
	maxa0 =	str(ara00.pop()); 	maxi0 =	str(ari0.pop());

	if maxa1 >= maxa0:
		maxa = maxa1
		lno = ara1.index(maxa1)
	else:
		maxa = maxa0
		lno = ara0.index(maxa0)

	if maxi1 >= maxi0:
		maxi = maxi1
	else:
		maxi = maxi0
	rs = str(float(maxa)-float(maxi))
	ids.append(lno)
	rss.append(rs)
	tca.append(maxa)

#writing the results with matchin ids
header = '#Qurey,Match_nscID,Match_pubchemSID,Mean_logGI50,Potency_Score,Maximum_tanimoto_Similarity_Score';
fp = open('ids.cpk',"rb");
drugbackground = cPickle.load(fp);
fp.close()
background = drugbackground['pbackground'];
ncititles = drugbackground['ncititles'];
nsc2sid = drugbackground['nsc2sid'];
GI50 = drugbackground['GI50'];
outfile = open(sys.argv[2],'w')
outfile.write("%s\n" %(header))
outarr = [];
combineval = []; 
dlen=len(ids)
for x in range(dlen):
	lineno= ids[x]
	rsd = str(rss[x])
	qud = str(qid[x])
	tcas = str(tca[x])
	NSCID = ncititles[lineno]
  	SID = nsc2sid[NSCID]
   	this_arr = ",".join([qud,NSCID,SID,GI50[NSCID],rsd,tcas]);
	outfile.write("%s\n" %(this_arr))
outfile.close();
os.remove("tc1")
os.remove("tc0")
os.remove("queryfp")
os.remove("cancerin_out")
print "Running cancerin_standard_alone.jar-----completed!"
