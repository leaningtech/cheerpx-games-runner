from pathlib import Path;
import subprocess;
import sys;

basePath = Path(sys.argv[1]);
mcopyImagePath = sys.argv[2];
autoexecOut = open(sys.argv[3], "wb");

# Find the *_single.conf file, depending on the game it might be in app/ or in the top-level directory
# TODO: Consider parsing the .info file to get all config files
def findConfigFile(path):
	for item in path.iterdir():
		if item.is_dir():
			ret = findConfigFile(item);
			if ret != None:
				return ret;
		elif item.name.endswith("_single.conf"):
			return item.open("rb");

def findDOSBOXPath(path):
	for item in path.iterdir():
		if item.name == "DOSBOX":
			return item.absolute();
		elif item.is_dir():
			ret = findDOSBOXPath(item);
			if ret != None:
				return ret;

configFile = findConfigFile(basePath);
# TODO: Use .info file to get the working dir
dosboxPath = findDOSBOXPath(basePath);

# TODO: Report error on config file not found

autoexecLines = None;

# Extract the autoexec section
for l in configFile:
	ls = l.strip();
	if ls.startswith(b"#"):
		# Comment, skip
		continue;
	elif ls.startswith(b"["):
		if ls == b"[autoexec]":
			autoexecLines = [];
		elif autoexecLines != None:
			# Another section after autoexec, stop
			break;
	elif autoexecLines != None:
		autoexecLines.append(ls);

def writeToAutoexec(l):
	# TODO: Remove debug print when the parsing is stabilized
	print(l);
	autoexecOut.write(l + b"\n");

print("Generating autoexec.bat");
for l in autoexecLines:
	parts = l.split(b" ");
	if parts[0].startswith(b"@"):
		# Skip, unsure what to do with these outside of DOSBox
		continue;
	elif parts[0] == b"mount":
		if parts[1].lower() != b"c":
			print("Skipping disk %s:" % parts[1].decode("utf-8"));
			continue;
		relPath = parts[2].strip(b"\"").replace(b"\\", b"/");
		mountType = None;
		for arg in range(3, len(parts)):
			if parts[arg] == b"-t":
				assert(arg + 1 < len(parts));
				mountType = parts[arg + 1];
				break;
		if mountType == b"overlay":
			print("Skipping overlay %s" % relPath);
			continue;
		copyPath = dosboxPath / relPath.decode("utf-8");
		for item in copyPath.iterdir():
			# Do not copy the DOSBox installation, it takes a few megabytes
			if item.samefile(dosboxPath):
				continue;
			# Copy the file or directory
			result = subprocess.run(["mcopy", "-i", mcopyImagePath, "-s", "-v", item.absolute(), "::"]);
			if result.returncode != 0:
				# Propagate the failure
				exit(result.returncode);
	elif parts[0] == b"imgmount":
		# Assume this is used for CD images
		if parts[1].lower() != b"d":
			print("Skipping image for d %s:" % parts[1].decode("utf-8"));
			continue;
		relPath = parts[2].strip(b"\"").replace(b"\\", b"/");
		copyPath = dosboxPath / relPath.decode("utf-8");
		result = subprocess.run(["cp", "-v", copyPath, basePath.as_posix() + "_d.iso"]);
		if result.returncode != 0:
			# Propagate the failure
			exit(result.returncode);
	elif parts[0] == b"exit":
		# Convert to a reboot, we can better handle that in the VM
		# NOTE: Temporarily disabled to simplify debugging
		#writeToAutoexec(b"fdisk /reboot");
		writeToAutoexec(b"");
	else:
		# Anything else is just copied verbatim
		writeToAutoexec(l);
