package org.openscience.cdk.tools;

/**
 * TeaVM-safe replacement for CDK 1.4.6's LoggingToolFactory.
 *
 * The original picks a logging implementation with ClassLoader.loadClass, which
 * TeaVM cannot compile. Logging is irrelevant to fingerprint values, so this
 * returns a no-op logger and keeps the original's public API.
 *
 * Part of the patched cdk-teavm jar; see tools/build-cdk-teavm.sh.
 */
public class LoggingToolFactory {

    public static final String DEFAULT_LOGGING_TOOL_CLASS = "org.openscience.cdk.tools.LoggingTool";
    public static final String STDOUT_LOGGING_TOOL_CLASS = "org.openscience.cdk.tools.SystemOutLoggingTool";

    private static Class<? extends ILoggingTool> loggingToolClass;

    public static void setLoggingToolClass(Class<? extends ILoggingTool> c) {
        loggingToolClass = c;
    }

    public static Class<? extends ILoggingTool> getLoggingToolClass() {
        return loggingToolClass;
    }

    public static ILoggingTool createLoggingTool(Class<?> forClass) {
        return NoOpLoggingTool.INSTANCE;
    }

    static final class NoOpLoggingTool implements ILoggingTool {
        static final NoOpLoggingTool INSTANCE = new NoOpLoggingTool();

        public void dumpSystemProperties() {}
        public void setStackLength(int length) {}
        public void dumpClasspath() {}
        public void debug(Object object) {}
        public void debug(Object object, Object... objects) {}
        public void error(Object object) {}
        public void error(Object object, Object... objects) {}
        public void fatal(Object object) {}
        public void info(Object object) {}
        public void info(Object object, Object... objects) {}
        public void warn(Object object) {}
        public void warn(Object object, Object... objects) {}
        public boolean isDebugEnabled() { return false; }
    }
}
